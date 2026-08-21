#!/usr/bin/env node
/**
 * 一键安装向导：node scripts/setup.js
 * 依赖安装 → 询问账号 → 写 config.json → 注册 MCP → 安装 skill → 连通自检
 * 测试/CI 可设 ZENTAO_MCP_NO_CLAUDE=1 跳过注册与 skill 安装
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadConfig } from '../lib/config.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const noClaude = process.env.ZENTAO_MCP_NO_CLAUDE === '1'
const IS_WIN = process.platform === 'win32'

const step = (s) => console.log(`\n▶ ${s}`)
const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { shell: IS_WIN, ...opts })

// 0. 环境
if (Number(process.versions.node.split('.')[0]) < 18) {
  console.error('需要 Node.js ≥ 18，当前', process.versions.node)
  process.exit(1)
}

// 1. 依赖
if (!fs.existsSync(path.join(root, 'node_modules', '@modelcontextprotocol'))) {
  step('安装依赖（国内镜像）…')
  const r = run('npm', ['install', '--no-audit', '--no-fund', '--registry=https://registry.npmmirror.com'], {
    cwd: root,
    stdio: 'inherit',
  })
  if (r.status !== 0) process.exit(1)
} else {
  step('依赖已存在，跳过 npm install')
}

// 2. 账号
const configPath = path.join(root, 'config.json')
let base = { ...loadConfig(root), modao: { ...loadConfig(root).modao } }
if (fs.existsSync(configPath)) {
  step('检测到已有 config.json（回车保留现值，输入新值覆盖）')
} else {
  step('配置账号（各人填各人的，勿外传）')
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
// 行缓冲队列：兼容交互输入与管道输入（管道行在无人提问时到达也不丢）
const lineQueue = []
let lineResolver = null
rl.on('line', (l) => {
  if (lineResolver) {
    const r = lineResolver
    lineResolver = null
    r(l)
  } else {
    lineQueue.push(l)
  }
})
rl.on('close', () => {
  if (lineResolver) {
    const r = lineResolver
    lineResolver = null
    r('')
  }
})
const ask = async (q, def = '') => {
  process.stdout.write(`${q}${def ? '（回车保留旧值）' : ''}：`)
  const a = (lineQueue.length ? lineQueue.shift() : await new Promise((r) => (lineResolver = r))).trim()
  return a || def
}
base.baseUrl = await ask('禅道地址', base.baseUrl || 'http://pm.esteel.tech/zentao')
base.account = await ask('禅道账号', base.account)
base.password = await ask('禅道密码', base.password)
base.modao = base.modao || {}
base.modao.account = await ask('墨刀账号（可选，回车跳过）', base.modao.account || '')
base.modao.password = await ask('墨刀密码（可选，回车跳过）', base.modao.password || '')
rl.close()
fs.writeFileSync(configPath, JSON.stringify(base, null, 2))
console.log('  已写入 config.json')

if (noClaude) {
  step('ZENTAO_MCP_NO_CLAUDE=1：跳过 MCP 注册与 skill 安装')
} else {
  const hasClaude = run(IS_WIN ? 'where' : 'which', ['claude']).status === 0
  if (!hasClaude) {
    console.error('  未找到 claude CLI，请手动注册：claude mcp add zentao --scope user -- node "' + path.join(root, 'index.js') + '"')
  } else {
    // 3. 注册 MCP
    step('注册 MCP server（user 级）…')
    run('claude', ['mcp', 'remove', 'zentao', '--scope', 'user'], { stdio: 'ignore' })
    const add = run('claude', ['mcp', 'add', 'zentao', '--scope', 'user', '--', 'node', path.join(root, 'index.js')], {
      stdio: 'inherit',
    })
    if (add.status !== 0) {
      console.error('  自动注册失败，请手动执行：claude mcp add zentao --scope user -- node "' + path.join(root, 'index.js') + '"')
    }
  }

  // 4. 安装 skill（拷贝时把文档里的默认路径替换成实际安装路径）
  step('安装 /zentao skill…')
  const src = path.join(root, 'skill', 'zentao', 'SKILL.md')
  if (fs.existsSync(src)) {
    const destDir = path.join(os.homedir(), '.claude', 'skills', 'zentao')
    fs.mkdirSync(destDir, { recursive: true })
    let md = fs.readFileSync(src, 'utf8')
    md = md
      .split('{{INSTALL_DIR}}')
      .join(root)
      .split('D:\\tools\\zentao-mcp')
      .join(root)
      .split('D:/tools/zentao-mcp')
      .join(root)
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), md)
    console.log('  已安装到', destDir)
  } else {
    console.error('  未找到 skill/zentao/SKILL.md，跳过')
  }
}

// 5. 连通自检
step('连通自检…')
try {
  const { ZentaoClient } = await import(pathToFileURL(path.join(root, 'lib', 'zentao-client.js')).href)
  const client = new ZentaoClient(loadConfig(root))
  await client.ensureLoggedIn()
  const html = await client.getHtml('/my-task-assignedTo.html')
  const n = (html.match(/task-view-\d+/g) || []).length
  console.log(`  ✔ 禅道登录成功，当前指派给你的任务 ${n} 个`)
} catch (e) {
  console.error('  ✘ 自检失败:', e.message)
  console.error('  可稍后重试，或检查账号密码；不影响已完成的安装步骤')
}

step('完成！')
console.log(`
接下来：
  1. 打开一个【新】的 Claude Code 会话（MCP 工具在会话启动时加载）
  2. 直接说：「看看指派给我的任务」或「禅道 bug 7551」
使用与排障见 USAGE.md。`)
