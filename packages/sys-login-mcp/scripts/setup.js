#!/usr/bin/env node
// 一键安装/更新 sys-login-mcp 到指定项目（默认 D:\projects\wbscf-web）。幂等，可重复执行。
// 做五件事：装依赖 → CNN 权重检查 → 配置账号（可交互式填入）→ 注册项目级 MCP → 部署项目级 skill
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const argProject = process.argv.find((a) => a.startsWith('--project='))
const PROJECT = argProject ? argProject.slice('--project='.length) : 'D:/projects/wbscf-web'

const log = (m) => console.log(`[setup] ${m}`)

// 账号文件是否仍是模板/无效（占位符或空）
function accountsNeedsSetup(file) {
  if (!fs.existsSync(file)) return true
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    const list = Array.isArray(raw.accounts) ? raw.accounts : []
    const valid = list.filter((a) => a.username && a.password && a.username !== '手机号' && a.password !== '密码')
    return valid.length === 0
  } catch {
    return true
  }
}

async function promptAccounts(file) {
  if (!process.stdin.isTTY) {
    log('当前非交互环境，跳过账号录入。请手动编辑 accounts.json（见下方"下一步"）')
    return false
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question('\n检测到还没有有效测试账号，现在填入吗？(Y/n) ')).trim().toLowerCase()
    if (answer && answer !== 'y' && answer !== 'yes') {
      log('已跳过。请稍后手动编辑 accounts.json（见下方"下一步"）')
      return false
    }
    const alias = ((await rl.question('  账号别名（回车默认 dev1）: ')).trim()) || 'dev1'
    const username = (await rl.question('  手机号: ')).trim()
    const password = (await rl.question('  密码: ')).trim()
    const note = (await rl.question('  备注（可空，如：单公司，erp 用）: ')).trim()
    if (!username || !password) {
      log('手机号或密码为空，未写入。请稍后手动编辑 accounts.json')
      return false
    }
    fs.writeFileSync(file, JSON.stringify({ default: alias, accounts: [{ alias, username, password, note }] }, null, 2))
    log(`账号 "${alias}" 已写入 ${file}${note ? `（${note}）` : ''}`)
    return true
  } finally {
    rl.close()
  }
}

async function main() {
  // 0. 项目目录校验：路径不存在（如 macOS 上用默认值）时明确报错，
  //    避免在错误位置注册 MCP / 创建垃圾 .claude 目录
  if (!fs.existsSync(PROJECT)) {
    console.error(`[setup] 项目目录不存在: ${PROJECT}`)
    console.error(`        请用 --project=<你的 wbscf-web 路径> 指定，例如: node scripts/setup.js --project=/Users/xxx/code/wbscf-web`)
    process.exit(1)
  }

  // 1. 依赖
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    log('安装依赖...')
    execSync('npm install --no-fund --no-audit', { cwd: ROOT, stdio: 'inherit' })
  } else {
    log('依赖已安装，跳过')
  }

  // 2. CNN 权重（仓库已内置 weights.json；仅当缺失时才尝试从本机 captcha-ext 提取——那只是维护者重训后的更新途径）
  if (!fs.existsSync(path.join(ROOT, 'weights.json'))) {
    log('weights.json 缺失（仓库应自带），尝试从 D:/projects/captcha-ext 提取...')
    try {
      execSync('node tools/extract-weights.mjs', { cwd: ROOT, stdio: 'inherit' })
    } catch {
      log('提取失败：需要 D:/projects/captcha-ext 存在。请从仓库重新获取 weights.json，或联系维护者。')
    }
  } else {
    log('weights.json 已就绪（仓库内置；重训更新: npm run extract-weights）')
  }

  // 3. 账号：无效时生成模板并交互式录入
  const accountsFile = path.join(ROOT, 'accounts.json')
  let accountsReady = !accountsNeedsSetup(accountsFile)
  if (accountsReady) {
    log(`accounts.json 已配置（${accountsFile}）`)
  } else {
    if (!fs.existsSync(accountsFile)) {
      fs.writeFileSync(accountsFile, JSON.stringify({
        default: 'dev1',
        accounts: [
          { alias: 'dev1', username: '手机号', password: '密码', note: '占位模板，请替换为真实测试账号' },
        ],
      }, null, 2))
    }
    accountsReady = await promptAccounts(accountsFile)
  }

  // 4. 项目级 MCP 注册
  const mcpJsonFile = path.join(PROJECT, '.mcp.json')
  let needRegister = true
  if (fs.existsSync(mcpJsonFile)) {
    try {
      const mcp = JSON.parse(fs.readFileSync(mcpJsonFile, 'utf8'))
      needRegister = !mcp.mcpServers?.['sys-login']
    } catch {
      log(`警告: ${mcpJsonFile} 解析失败`)
    }
  }
  if (needRegister) {
    log(`注册项目级 MCP 到 ${mcpJsonFile} ...`)
    try {
      execSync(`claude mcp add --scope project sys-login node "${path.join(ROOT, 'index.js')}"`, { cwd: PROJECT, stdio: 'inherit' })
    } catch {
      log(`claude CLI 注册失败，请手动在 ${mcpJsonFile} 的 mcpServers 下添加: "sys-login": { "type": "stdio", "command": "node", "args": ["${path.join(ROOT, 'index.js')}"] }`)
    }
  } else {
    log('项目 .mcp.json 已含 sys-login，跳过')
  }

  // 5. 项目级 skill 部署
  const skillDir = path.join(PROJECT, '.claude', 'skills', 'sys-login')
  fs.mkdirSync(skillDir, { recursive: true })
  fs.copyFileSync(path.join(ROOT, 'skill', 'sys-login', 'SKILL.md'), path.join(skillDir, 'SKILL.md'))
  log(`skill 已部署/更新到 ${skillDir}`)

  console.log(`
================ 下一步 ================`)
  if (!accountsReady) {
    console.log(`1. 填入测试账号（当前还未配置！）: 编辑 ${accountsFile}
   格式: {"default":"dev1","accounts":[{"alias":"dev1","username":"手机号","password":"密码","note":"备注"}]}`)
    console.log('2. 重启 Claude Code 会话（MCP 工具生效）')
  } else {
    console.log('1. 重启 Claude Code 会话（MCP 工具生效）')
  }
  console.log('2. 验证登录链路: npm run probe -- --app=erp')
  console.log('3. 在 Claude 里说"登录 erp 验证"，或做完需求让它验证页面时自动触发')
  console.log('========================================')
}

main().catch((e) => {
  console.error('[setup] 失败:', e.message)
  process.exit(1)
})
