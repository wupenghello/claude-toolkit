#!/usr/bin/env node
// apifox-mcp wrapper：读本地 config.json 的 token，spawn apifox-mcp-server 并透传 stdio。
// 为什么需要 wrapper：apifox-mcp-server 是 npx 远程包，token 只能走 env；
// 直接把 token 写进 registry.json / .mcp.json 会泄漏进 git。wrapper 让 token 只存在于 gitignore 的 config.json。
//
// 本进程绝不在 stdout 输出任何东西（stdout 是 MCP 协议通道），日志一律走 stderr。
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, resolveProject, PROJECT_KEYS } from './lib/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 解析 --project <key> 或位置参数 <key>
function parseKey(argv) {
  const a = argv.slice(2)
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--project' && a[i + 1]) return a[i + 1]
  }
  return a.find((x) => !x.startsWith('-')) ?? null
}

const key = parseKey(process.argv)
if (!key || !PROJECT_KEYS.includes(key)) {
  console.error(`[apifox] 缺少或无效的 project key，用法: node index.js --project <${PROJECT_KEYS.join('|')}>`)
  process.exit(1)
}

const resolved = resolveProject(loadConfig(), key)
if (resolved.error) {
  console.error(`[apifox] ${resolved.error}`)
  process.exit(1)
}

const { id, token } = resolved
const isWin = process.platform === 'win32'
// Windows 下直接用 npx.cmd 作 command 会 spawn EINVAL，官方推荐 cmd /c npx 的写法
const command = isWin ? 'cmd' : 'npx'
const baseArgs = ['-y', 'apifox-mcp-server@0.0.17', `--project-id=${id}`, '--tool-suffix=']
const args = isWin ? ['/c', 'npx', ...baseArgs] : baseArgs
// --tool-suffix= 必须带尾随等号：这是让工具名固定（不带随机后缀）的唯一正确写法。
// 裸 --tool-suffix / --tool-suffix=false 都会保持随机后缀（源码: hf = typeof v < "u" && !v）。
// 版本固定 @0.0.17：工具集与 --tool-suffix 语义是版本相关的，@latest 升级可能破坏固定工具名。
const env = { ...process.env, APIFOX_ACCESS_TOKEN: token }

const child = spawn(command, args, { stdio: 'inherit', env, windowsHide: true })

child.on('error', (e) => {
  console.error(`[apifox] 启动失败: ${e.message}`)
  console.error('[apifox] 首次运行需联网拉取 apifox-mcp-server@0.0.17，请检查网络，或手动执行: npx -y apifox-mcp-server@0.0.17')
  process.exit(1)
})

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})

// 转发终止信号给 npx 子进程，避免 Claude 关停 / 用户 Ctrl+C 后遗留孤儿进程。
// Windows 上 SIGINT/SIGTERM 都退化为 TerminateProcess（语义等价）；非 Windows 保留信号区分。
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    try {
      child.kill(sig)
    } catch {
      // 子进程可能已退出，忽略
    }
  })
}
