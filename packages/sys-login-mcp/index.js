#!/usr/bin/env node
/**
 * sys-login-mcp — wbscf-web dev 环境自动登录 MCP server
 * 能力: 拉取图片验证码并 CNN 识别 → UAA API 登录（type=auto 优先，验证码路径兜底）→ 生成浏览器注入片段
 * 工具: sys_status / sys_accounts / sys_login / sys_captcha_solve
 * 用法编排见配套全局 skill: sys-login
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  APPS,
  APP_NAMES,
  loadAccounts,
  loadWeights,
  findAccount,
} from './lib/config.js'
import { loadWeights as cnnLoadWeights } from './lib/captcha-cnn.js'
import { login } from './lib/login-core.js'
import { recognizeBase64 } from './lib/captcha-image.js'
import { buildInject } from './lib/inject-builder.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const server = new McpServer({ name: 'sys-login', version: '1.0.0' })

const text = (s) => ({ content: [{ type: 'text', text: s }] })
const errText = (e) => ({ isError: true, content: [{ type: 'text', text: `sys-login 失败: ${e.message ?? e}` }] })
const jsonText = (obj) => text(JSON.stringify(obj, null, 2))

function maskPhone(username) {
  return String(username).length >= 7
    ? `${String(username).slice(0, 3)}****${String(username).slice(-4)}`
    : '***'
}

// 权重懒加载（只加载一次）
let cnnReady = null
function ensureCnn() {
  if (cnnReady !== null) return cnnReady
  const w = loadWeights()
  if (w.error) {
    cnnReady = { error: w.error }
  } else {
    try {
      cnnLoadWeights(w.tensors)
      cnnReady = { ok: true }
    } catch (e) {
      cnnReady = { error: e.message }
    }
  }
  return cnnReady
}

// ---------- 工具 ----------

server.registerTool(
  'sys_status',
  {
    title: 'sys-login 状态检查',
    description: '检查 sys-login MCP 配置状态：测试账号加载情况、CNN 权重、各应用 dev 后端连通性。使用前可先调用确认。',
    inputSchema: {},
  },
  async () => {
    try {
      const lines = []
      const accounts = loadAccounts()
      if (accounts.error) {
        lines.push(`账号: 未配置（${accounts.error}）`)
      } else {
        lines.push(`账号: ${accounts.accounts.length} 个（${accounts.accounts.map((a) => a.alias).join(', ')}），默认: ${accounts.default ?? accounts.accounts[0]?.alias ?? '无'}`)
      }
      const cnn = ensureCnn()
      lines.push(`CNN 权重: ${cnn.ok ? '已加载' : `不可用（${cnn.error}）`}`)
      for (const [name, conf] of Object.entries(APPS)) {
        let reach
        try {
          const res = await fetch(`${conf.backend}/api/captcha/web/image-captcha?width=120&height=40&length=4`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(8000),
          })
          reach = res.ok ? '连通' : `HTTP ${res.status}`
        } catch (e) {
          reach = `不通 (${e.message?.slice(0, 60)})`
        }
        lines.push(`${name}: ${conf.backend} → ${reach}`)
      }
      return text(lines.join('\n'))
    } catch (e) {
      return errText(e)
    }
  },
)

server.registerTool(
  'sys_accounts',
  {
    title: '列出测试账号',
    description: '列出可用的测试账号（别名、用户名打码、备注、是否默认）。密码不返回。',
    inputSchema: {},
  },
  async () => {
    try {
      const accounts = loadAccounts()
      if (accounts.error) return text(accounts.error)
      if (!accounts.accounts.length) return text('accounts.json 中没有账号')
      return jsonText({
        default: accounts.default ?? accounts.accounts[0].alias,
        accounts: accounts.accounts.map((a) => ({
          alias: a.alias,
          username: maskPhone(a.username),
          note: a.note ?? '',
        })),
      })
    } catch (e) {
      return errText(e)
    }
  },
)

server.registerTool(
  'sys_login',
  {
    title: '登录 dev 系统拿 token',
    description:
      '用测试账号登录 wbscf-web 指定应用（erp/ops/account/buyer/seller）的 dev 后端，返回 token 和可直接执行的浏览器注入代码（preview_eval）。优先免验证码 type=auto，失败自动走 CNN 图片验证码识别（最多 5 轮）。注入后刷新页面即可进入系统。',
    inputSchema: {
      app: z.enum(APP_NAMES).describe('应用名: erp / ops / account / buyer / seller'),
      account: z.string().optional().describe('账号别名，缺省用 accounts.json 的默认账号'),
    },
  },
  async ({ app, account }) => {
    try {
      const conf = APPS[app]
      const found = findAccount(loadAccounts(), account)
      if (found.error) return text(found.error)
      const acc = found.account
      const logs = []
      const result = await login(
        { backend: conf.backend, username: acc.username, password: acc.password },
        { onLog: (m) => logs.push(m) },
      )
      if (!result.ok) {
        const hint =
          result.error === 'captcha_exhausted' || result.error === 'captcha_format'
            ? '（CNN 可能已失效——后端验证码样式变更？需由维护者重训并更新仓库内 weights.json，使用者拉取更新即可）'
            : result.error === 'credential'
              ? '（账号密码错误，请检查 accounts.json）'
              : ''
        return jsonText({ ok: false, app, accountAlias: acc.alias, error: result.error, detail: result.detail, hint, logs })
      }
      const { evalCode, reloadCode } = buildInject(app, result.token)
      return jsonText({
        ok: true,
        app,
        accountAlias: acc.alias,
        username: maskPhone(acc.username),
        backend: conf.backend,
        method: result.method,
        devUrl: conf.devUrl,
        launch: conf.launch,
        injectType: conf.inject,
        // 在 devUrl 页面上用 preview_eval 执行 evalCode，再执行 reloadCode，即完成登录
        evalCode,
        reloadCode,
        notes: conf.notes,
        logs,
      })
    } catch (e) {
      return errText(e)
    }
  },
)

server.registerTool(
  'sys_captcha_solve',
  {
    title: '识别一张图片验证码（诊断用）',
    description: '从指定后端拉一张新的图片验证码并用 CNN 识别，返回识别结果与各字符置信度。用于诊断 CNN 是否失效（比如后端验证码样式变更后）。',
    inputSchema: {
      app: z.enum(APP_NAMES).optional().describe('应用名（决定从哪个后端拉验证码），缺省 erp'),
    },
  },
  async ({ app }) => {
    try {
      const cnn = ensureCnn()
      if (cnn.error) return text(`CNN 不可用: ${cnn.error}`)
      const backend = APPS[app ?? 'erp'].backend
      const res = await fetch(`${backend}/api/captcha/web/image-captcha?width=120&height=40&length=4`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.imageBase64) {
        return text(`拉取验证码失败: HTTP ${res.status}`)
      }
      const r = recognizeBase64(body.imageBase64)
      if (r.error) return jsonText({ ok: false, error: r.error })
      return jsonText({
        ok: true,
        backend,
        id: body.id,
        code: r.code,
        confs: r.confs,
        minConf: r.minConf,
        fillable: r.minConf >= 0.75,
      })
    } catch (e) {
      return errText(e)
    }
  },
)

// ---------- 启动 ----------
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('sys-login-mcp 已启动（工具: sys_status / sys_accounts / sys_login / sys_captcha_solve）')
}

main().catch((e) => {
  console.error('sys-login-mcp 启动失败:', e.message)
  process.exit(1)
})
