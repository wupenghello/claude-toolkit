#!/usr/bin/env node
// 一键安装/更新 apifox-mcp 到指定项目（默认按平台/同级目录自动解析）。幂等，可重复执行。
// 五步：项目校验 → 凭据录入（config.json）→ 确保部署（toolkit install）→ 迁移清理旧条目 → 连通自检
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { isPlaceholderToken } from '../lib/config.js'
import { defaultProjectDir } from '../../../lib/platform.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.join(__dirname, '..')
const TOOLKIT_ROOT = path.join(PKG_ROOT, '..', '..')

const argProject = process.argv.find((a) => a.startsWith('--project='))
const PROJECT = argProject ? argProject.slice('--project='.length) : defaultProjectDir(TOOLKIT_ROOT)

const log = (m) => console.log(`[setup] ${m}`)

// 迁移清理：wbscf-web 旧的两条 apifox 手写条目
const OLD_SERVERS = ['API 文档', '物泊智链接口聚合 - API 文档']
const NEW_SERVERS = ['apifox-erp', 'apifox-wbzl']

// config.json 是否仍是模板/无效（token 为空或占位文案）
function configNeedsSetup(file) {
  if (!fs.existsSync(file)) return true
  try {
    return isPlaceholderToken(JSON.parse(fs.readFileSync(file, 'utf8')).token)
  } catch {
    return true
  }
}

async function promptToken(file) {
  if (!process.stdin.isTTY) {
    log('当前非交互环境，跳过 token 录入。请手动编辑 config.json（见下方"下一步"）')
    return false
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question('\n检测到还没有有效 token，现在填入吗？(Y/n) ')).trim().toLowerCase()
    if (answer && answer !== 'y' && answer !== 'yes') {
      log('已跳过。请稍后手动编辑 config.json（见下方"下一步"）')
      return false
    }
    const token = (await rl.question('  API 访问令牌（Apifox 头像 → 个人设置 → API 访问令牌）: ')).trim()
    if (isPlaceholderToken(token)) {
      log('token 为空或仍是占位文案，未写入。请稍后手动编辑 config.json')
      return false
    }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    raw.token = token
    fs.writeFileSync(file, JSON.stringify(raw, null, 2))
    log(`token 已写入 ${file}`)
    return true
  } finally {
    rl.close()
  }
}

function mcpHas(projectDir, name) {
  const f = path.join(projectDir, '.mcp.json')
  if (!fs.existsSync(f)) return false
  try {
    return !!JSON.parse(fs.readFileSync(f, 'utf8')).mcpServers?.[name]
  } catch {
    return false
  }
}

function ensureDeployed() {
  if (NEW_SERVERS.every((n) => mcpHas(PROJECT, n))) {
    log('项目 .mcp.json 已含 apifox-erp/apifox-wbzl，跳过部署')
    return
  }
  log('部署 MCP + skill 到项目（toolkit install apifox）...')
  const r = spawnSync(
    'node',
    [path.join(TOOLKIT_ROOT, 'scripts', 'install.js'), 'install', 'apifox', `--project=${PROJECT}`],
    { stdio: 'inherit' },
  )
  if (r.status !== 0) {
    log(`部署失败（exit ${r.status}）。可手动执行: node ${path.join(TOOLKIT_ROOT, 'scripts', 'install.js')} install apifox --project=${PROJECT}`)
  }
}

// 迁移：从项目旧 .mcp.json 里已配的 apifox token 提取到 config.json（同事已配过旧 apifox 时免重新找 token）
function migrateTokenFromOld(configFile) {
  const f = path.join(PROJECT, '.mcp.json')
  if (!fs.existsSync(f)) return false
  let old
  try {
    old = JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    return false
  }
  const token =
    old.mcpServers?.['物泊智链接口聚合 - API 文档']?.env?.APIFOX_ACCESS_TOKEN ||
    old.mcpServers?.['API 文档']?.env?.APIFOX_ACCESS_TOKEN ||
    ''
  if (isPlaceholderToken(token)) return false
  try {
    const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'))
    raw.token = token
    fs.writeFileSync(configFile, JSON.stringify(raw, null, 2))
  } catch {
    return false
  }
  log(`已从项目旧 .mcp.json 迁移 token 到 ${configFile}（无需重新找 token）`)
  return true
}

// 兜底清理旧两条：install 的 removeMcpServers 是主路径，但 ensureDeployed 发现已部署时会跳过 install，
// 此时残留的旧条目靠这里清理。删除不存在条目是 no-op，幂等，不是与 install 的重复。
function cleanupOldServers() {
  const f = path.join(PROJECT, '.mcp.json')
  if (!fs.existsSync(f)) return
  let mcp
  try {
    mcp = JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    log(`警告: ${f} 解析失败，跳过旧条目清理`)
    return
  }
  let changed = false
  for (const name of OLD_SERVERS) {
    if (mcp.mcpServers?.[name]) {
      delete mcp.mcpServers[name]
      changed = true
    }
  }
  if (changed) {
    fs.writeFileSync(f, JSON.stringify(mcp, null, 2) + '\n')
    log(`已清理旧 apifox 条目: ${OLD_SERVERS.join(', ')}`)
  }
}

async function main() {
  // 0. 项目路径校验
  if (!fs.existsSync(PROJECT)) {
    console.error(`[setup] 项目目录不存在: ${PROJECT}`)
    console.error(`        请用 --project=<你的 wbscf-web 路径> 指定，例如: node scripts/setup.js --project=/Users/xxx/code/wbscf-web`)
    process.exit(1)
  }

  // 1. config.json：缺失从模板生成，优先迁移旧 token，否则交互录入
  const configFile = path.join(PKG_ROOT, 'config.json')
  let tokenReady = !configNeedsSetup(configFile)
  if (tokenReady) {
    log(`config.json 已配置（${configFile}）`)
  } else {
    if (!fs.existsSync(configFile)) {
      fs.copyFileSync(path.join(PKG_ROOT, 'config.example.json'), configFile)
      log(`已从 config.example.json 生成 ${configFile}`)
    }
    tokenReady = migrateTokenFromOld(configFile) || (await promptToken(configFile))
  }

  // 2. 确保部署
  ensureDeployed()

  // 3. 清理旧条目
  cleanupOldServers()

  // 4. 连通自检
  log('连通自检（probe）...')
  const probe = spawnSync('node', [path.join(PKG_ROOT, 'scripts', 'probe.js')], { stdio: 'inherit' })
  if (probe.status !== 0) {
    log('自检未通过（token 未填或网络问题），不影响已完成步骤，可稍后重试')
  }

  // 5. 结尾编号清单
  console.log('\n================ 下一步 ================')
  let i = 1
  if (!tokenReady) {
    console.log(`${i++}. 填入真实 token（当前未配置！）: 编辑 ${configFile}`)
    console.log('   格式: {"token":"afxp_...","projects":{"erp":{"id":"7718065","name":"ERP 接口聚合"},"wbzl":{"id":"6574890","name":"物泊智链接口聚合"}}}')
  }
  console.log(`${i++}. 重启 Claude Code 会话（MCP 工具生效）`)
  console.log(`${i++}. 验证: node ${path.join(PKG_ROOT, 'scripts', 'probe.js')}`)
  console.log(`${i++}. 在 Claude 里说「查一下 ERP 订单查询接口的参数和返回值」触发`)
  console.log('========================================')
}

main().catch((e) => {
  console.error('[setup] 失败:', e.message)
  process.exit(1)
})
