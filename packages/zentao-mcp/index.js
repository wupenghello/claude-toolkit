#!/usr/bin/env node
/**
 * zentao-mcp — 禅道 12.5.3 专业版只读 MCP server（web session 登录 + HTML 解析）
 * 工具: zentao_status / zentao_my_work / zentao_get_bug / zentao_get_task /
 *       zentao_get_image / zentao_fetch_link
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { ZentaoClient, ZentaoError } from './lib/zentao-client.js'
import { ModaoClient } from './lib/modao-client.js'
import { loadConfig } from './lib/config.js'
import { htmlToText } from './lib/html.js'
import {
  parseTitleId,
  parseDetailSections,
  parseFields,
  parseHistories,
  parseListRows,
  collectMedia,
} from './lib/zentao-page.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const config = loadConfig(__dirname)
const client = new ZentaoClient(config)

const server = new McpServer({ name: 'zentao', version: '1.0.0' })

const text = (s) => ({ content: [{ type: 'text', text: s }] })
const errText = (e) => ({
  isError: true,
  content: [{ type: 'text', text: `禅道请求失败: ${e.message ?? e}` }],
})

// ---------- 格式化 ----------
function formatFields(fields, pick) {
  const lines = []
  for (const k of pick) {
    if (fields[k]) lines.push(`${k}: ${fields[k]}`)
  }
  return lines
}

function mediaSection(html) {
  const { images, links } = collectMedia(html)
  if (!images.length && !links.length) return ''
  const lines = ['', '## 图片与链接（需识别图片时调用 zentao_get_image）']
  for (const img of images) lines.push(`- 图片: ${img}`)
  for (const l of links) lines.push(`- 链接: ${l.href}${l.text ? ` (${l.text})` : ''}`)
  return lines.join('\n')
}

function formatDetail(html, kind /* 'bug' | 'task' */) {
  const { id, title } = parseTitleId(html)
  const fields = parseFields(html)
  const sections = parseDetailSections(html)
  const histories = parseHistories(html)

  const out = [`# ${kind === 'bug' ? 'Bug' : '任务'} #${id ?? '?'} ${title ?? ''}`, '']

  // 关键字段
  const pick =
    kind === 'bug'
      ? ['所属产品', '所属模块', 'Bug类型', '严重程度', '优先级', 'Bug状态', '当前指派', '是否确认', '关键词', '由谁创建', '由谁解决', '解决方案', '由谁关闭', '截止日期']
      : ['所属迭代', '所属模块', '相关需求', '指派给', '任务类型', '任务状态', '进度', '优先级', '由谁创建', '截止日期']
  const fl = formatFields(fields, pick)
  if (fl.length) out.push('## 基本信息', ...fl, '')

  // 描述区块（跳过历史记录，单独放最后）
  for (const s of sections) {
    if (s.title === '历史记录') continue
    if (!s.text && !s.html.includes('<img')) continue
    out.push(`## ${s.title}`, s.text || '(仅含图片)', '')
  }

  // 历史/评论
  if (histories.length) {
    out.push('## 历史记录与评论')
    for (const h of histories) out.push(`- ${h}`)
    out.push('')
  }

  return out.join('\n')
}

function formatListRows(rows, kindLabel) {
  if (!rows.length) return `（当前没有指派给我的${kindLabel}）`
  const lines = []
  for (const r of rows) {
    const bits = [`${r.type} #${r.id}`, `[${r.status || '?'}]`, r.name]
    const meta = []
    if (r.severity) meta.push(`严重:${r.severity}`)
    if (r.pri) meta.push(`优先:${r.pri}`)
    if (r.project) meta.push(r.project)
    if (meta.length) bits.push(`(${meta.join(' ')})`)
    lines.push(`- ${bits.join(' ')}`)
  }
  return lines.join('\n')
}

// ---------- 工具 ----------
server.registerTool(
  'zentao_status',
  {
    title: '禅道连接状态',
    description: '检查禅道 MCP 的登录状态与配置（账号、地址）。处理禅道任务前可先调用确认连通。',
    inputSchema: {},
  },
  async () => {
    try {
      const loggedIn = await client.isLoggedIn()
      return text(
        [
          `禅道地址: ${client.baseUrl}`,
          `配置账号: ${client.account || '(未配置)'}`,
          `当前会话: ${loggedIn ? '已登录' : '未登录（调用其他工具时会自动登录）'}`,
        ].join('\n'),
      )
    } catch (e) {
      return errText(e)
    }
  },
)

server.registerTool(
  'zentao_my_work',
  {
    title: '指派给我的工作',
    description:
      '获取当前禅道账号"指派给我的"未完成任务和 bug 列表。返回每条的 id、标题、状态、优先级、所属迭代。',
    inputSchema: {
      type: z.enum(['all', 'bug', 'task']).default('all').describe('只看 bug / 只看任务 / 全部'),
    },
  },
  async ({ type }) => {
    try {
      const parts = []
      if (type !== 'task') {
        const html = await client.getHtml('/my-bug-assignedTo.html')
        parts.push('## 指派给我的 Bug', formatListRows(parseListRows(html), 'Bug'))
      }
      if (type !== 'bug') {
        const html = await client.getHtml('/my-task-assignedTo.html')
        parts.push('## 指派给我的任务', formatListRows(parseListRows(html), '任务'))
      }
      return text(parts.join('\n\n'))
    } catch (e) {
      return errText(e)
    }
  },
)

server.registerTool(
  'zentao_get_bug',
  {
    title: 'Bug 详情',
    description:
      '按 id 获取禅道 bug 完整详情：标题、基本信息、重现步骤（含图片/链接清单）、历史记录与评论。',
    inputSchema: { id: z.number().describe('bug id，如 bug-view-7551 中的 7551') },
  },
  async ({ id }) => {
    try {
      const html = await client.getHtml(`/bug-view-${id}.html`)
      const body = formatDetail(html, 'bug')
      return text(body + mediaSection(html))
    } catch (e) {
      return errText(e)
    }
  },
)

server.registerTool(
  'zentao_get_task',
  {
    title: '任务详情',
    description:
      '按 id 获取禅道任务完整详情：标题、基本信息、任务描述/需求描述/验收标准（含图片/链接清单）、历史记录。',
    inputSchema: { id: z.number().describe('任务 id，如 task-view-8841 中的 8841') },
  },
  async ({ id }) => {
    try {
      const html = await client.getHtml(`/task-view-${id}.html`)
      const body = formatDetail(html, 'task')
      return text(body + mediaSection(html))
    } catch (e) {
      return errText(e)
    }
  },
)

server.registerTool(
  'zentao_get_image',
  {
    title: '获取禅道图片',
    description:
      '下载禅道描述/评论中的图片并直接返回图像内容（可视觉识别）。url 必须是禅道域内的图片地址（来自 bug/任务详情中的图片清单，如 /zentao/file-read-15523.png）。',
    inputSchema: { url: z.string().describe('图片 URL，支持相对路径') },
  },
  async ({ url }) => {
    try {
      const abs = client.resolveUrl(url)
      const { buffer, contentType } = await client.fetchBinary(abs)
      const mime = /image\//.test(contentType) ? contentType.split(';')[0] : 'image/png'
      return {
        content: [
          { type: 'image', data: buffer.toString('base64'), mimeType: mime },
          { type: 'text', text: `图片: ${abs}` },
        ],
      }
    } catch (e) {
      return errText(e)
    }
  },
)

server.registerTool(
  'zentao_fetch_link',
  {
    title: '抓取禅道站内链接',
    description:
      '抓取禅道站内链接（如关联的其他 bug/任务/需求/用例页）并转成文本。若是 bug-view/task-view 链接，会提示改用对应详情工具。',
    inputSchema: { url: z.string().describe('禅道站内链接，支持相对路径') },
  },
  async ({ url }) => {
    try {
      const abs = client.resolveUrl(url)
      const bugTask = abs.match(/(bug|task)-view-(\d+)\.html/)
      if (bugTask) {
        const tool = bugTask[1] === 'bug' ? 'zentao_get_bug' : 'zentao_get_task'
        return text(`这是禅道 ${bugTask[1]} #${bugTask[2]} 的链接，请直接调用 ${tool}（id=${bugTask[2]}）获取结构化内容。`)
      }
      const html = await client.getHtml(abs)
      // 若是详情页结构（有 id 标题区），走统一解析
      if (parseTitleId(html).id) {
        return text(formatDetail(html, 'task'))
      }
      const t = htmlToText(html)
      return text(t.slice(0, 6000) || '(页面无文本内容)')
    } catch (e) {
      return errText(e)
    }
  },
)

const modao = new ModaoClient({
  modao: config.modao,
  sessionFile: path.join(__dirname, '.modao-session.json'),
  tmpDir: client.tmpDir,
})

server.registerTool(
  'modao_fetch',
  {
    title: '渲染墨刀原型页',
    description:
      '用无头浏览器打开墨刀（modao.cc）共享原型链接，返回整页截图（图像）与页面文本。用于识别禅道任务里的墨刀原型内容。只读，不做任何写操作。',
    inputSchema: { url: z.string().describe('墨刀链接，如 https://modao.cc/proto/xxx/sharing?...') },
  },
  async ({ url }) => {
    try {
      const res = await modao.fetchProto(url)
      client.ensureTmpDir()
      const shotPath = path.join(client.tmpDir, `modao-${Date.now()}.png`)
      fs.writeFileSync(shotPath, res.screenshot)
      return {
        content: [
          { type: 'image', data: res.screenshot.toString('base64'), mimeType: 'image/png' },
          {
            type: 'text',
            text: [
              `墨刀页面: ${res.url}`,
              `标题: ${res.title}`,
              `（整页截图已存: ${shotPath}）`,
              '--- 页面文本 ---',
              res.text || '(无可提取文本，以截图为准)',
            ].join('\n'),
          },
        ],
      }
    } catch (e) {
      return errText(e)
    }
  },
)

// ---------- 启动 ----------
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`zentao-mcp 已启动 -> ${client.baseUrl}`)
}

main().catch((e) => {
  console.error('zentao-mcp 启动失败:', e.message)
  process.exit(1)
})
