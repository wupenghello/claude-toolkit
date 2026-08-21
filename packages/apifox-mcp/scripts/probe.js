#!/usr/bin/env node
// 连通自检：不启动 Claude，直接验证「token 能拉到两个 project 的 OAS」+「工具名固定无随机后缀」。
// 主模式（默认）：spawn wrapper 走真实 JSON-RPC 链路（wrapper → npx → apifox-mcp-server → token）。
// 副模式 --http：直接 fetch Apifox API，轻量兜底（不验证工具名固定）。
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, resolveProject, PROJECT_KEYS } from '../lib/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.join(__dirname, '..')
const httpOnly = process.argv.includes('--http')

const EXPECTED_TOOLS = ['read_project_oas', 'read_project_oas_ref_resources', 'refresh_project_oas']

function rpc(id, method, params = {}) {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
}

function parseLines(text) {
  return (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

// 从 read_project_oas 返回的 text 里解析 OAS，精确数接口（path）数量
function countPaths(text) {
  let obj = text
  // text 可能是 JSON 字符串，或 JSON.stringify 后的双重转义；最多剥两层
  for (let i = 0; i < 2 && typeof obj === 'string'; i++) {
    try {
      obj = JSON.parse(obj)
    } catch {
      break
    }
  }
  if (obj && typeof obj === 'object' && obj.paths && typeof obj.paths === 'object') {
    return Object.keys(obj.paths).length
  }
  return 0
}

// 用 wrapper 走真实链路，返回 { ok, pathCount, error }
function runWrapper(key) {
  const input =
    rpc(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '1.0.0' } }) +
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
    '\n' +
    rpc(2, 'tools/list') +
    rpc(3, 'tools/call', { name: 'read_project_oas', arguments: {} })

  const res = spawnSync('node', [path.join(PKG_ROOT, 'index.js'), '--project', key], {
    input,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (res.error) return { ok: false, error: `spawn 失败: ${res.error.message}` }

  const objs = parseLines(res.stdout)
  const toolsResp = objs.find((j) => j.id === 2)
  const callResp = objs.find((j) => j.id === 3)

  if (!toolsResp) {
    return { ok: false, error: `tools/list 无响应（stderr: ${(res.stderr || '').slice(0, 200)}）` }
  }
  const tools = (toolsResp.result?.tools || []).map((t) => t.name)
  const fixedOk = tools.length === EXPECTED_TOOLS.length && EXPECTED_TOOLS.every((n) => tools.includes(n))
  if (!fixedOk) {
    return { ok: false, error: `工具名非固定（--tool-suffix= 未生效）: [${tools.join(', ')}]` }
  }

  if (callResp?.error || callResp?.result?.isError) {
    return { ok: false, error: `read_project_oas 调用失败: ${JSON.stringify(callResp.error ?? callResp.result).slice(0, 300)}` }
  }
  const content = callResp?.result?.content?.[0]?.text || ''
  if (!content || content.length < 100) {
    return { ok: false, error: 'read_project_oas 返回为空' }
  }
  const pathCount = countPaths(content)
  return { ok: true, pathCount }
}

// --http 直连 Apifox API 验证 token + id
async function httpCheck(key) {
  const resolved = resolveProject(loadConfig(), key)
  if (resolved.error) return { ok: false, error: resolved.error }
  try {
    const res = await fetch(`https://api.apifox.com/v1/projects/${resolved.id}/export-openapi`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolved.token}`,
        'X-Apifox-Version': '2024-03-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: { type: 'ALL' } }),
    })
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status} ${res.statusText}` }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function main() {
  if (httpOnly) console.log('模式: --http 直连（不验证工具名固定）')
  let allOk = true
  for (const key of PROJECT_KEYS) {
    const r = httpOnly ? await httpCheck(key) : runWrapper(key)
    if (r.ok) {
      const extra = httpOnly ? '' : r.pathCount ? `（OAS 含 ${r.pathCount} 个接口）` : ''
      console.log(`  ✔ ${key}: OK${extra}`)
    } else {
      allOk = false
      console.log(`  ✘ ${key}: ${r.error}`)
    }
  }
  if (!allOk) process.exitCode = 1
}

main()
