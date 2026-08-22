#!/usr/bin/env node
// toolkit — claude-toolkit 统一安装器
// 用法:
//   node scripts/install.js list                        列组件：已装/未装 + 依赖
//   node scripts/install.js                              无参数：交互式选择安装
//   node scripts/install.js install zentao sys-login     命令行指定安装（自动补依赖）
//   node scripts/install.js install --all                全装
//   node scripts/install.js uninstall mcp-scaffold       卸载（反向依赖检查）
//   通用: --project=<路径> 指定目标项目（默认 D:/projects/wbscf-web）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { isCancel, multiselect } from '@clack/prompts'
import {
  loadRegistry,
  validateRegistry,
  byName,
  resolveDeps,
  topoSort,
  componentInstalled,
  installComponent,
  uninstallComponent,
  reverseDependents,
} from '../lib/registry-core.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const argProject = process.argv.find((a) => a.startsWith('--project='))
const PROJECT = argProject ? argProject.slice('--project='.length) : 'D:/projects/wbscf-web'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const cmd = args[0] ?? 'install' // 默认命令：交互式安装
const names = args.slice(1).filter((a) => !a.startsWith('--'))
const all = process.argv.includes('--all')
// update 未指定组件时默认更新全部；install 未指定仍走交互/引导
const defaultAll = all || (cmd === 'update' && names.length === 0)

let components = []
let map = {}
function reloadRegistry() {
  const registry = loadRegistry(ROOT)
  components = registry.components
  map = byName(components)
}
reloadRegistry()

const isInstalled = (c) => componentInstalled(PROJECT, c)

function checkProject() {
  if (!fs.existsSync(PROJECT)) {
    console.error(`[toolkit] 项目目录不存在: ${PROJECT}`)
    console.error('        请用 --project=<你的项目路径> 指定')
    process.exit(1)
  }
}

// 更新仓库代码：从远端拉取（--ff-only 只快进，避免本地改动被合入）
function gitPull() {
  try {
    const out = execSync('git pull --ff-only', { cwd: ROOT, encoding: 'utf8' })
    if (out.trim()) console.log(out.trim())
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString().trim()
    console.error(`[toolkit] git pull 失败：${msg || '未知错误'}`)
    console.error('        请确认仓库目录无未提交改动、能访问 github.com，然后重试。')
    process.exit(1)
  }
}

// 检查是否有新版本（best-effort）：fetch 后对比本地 HEAD 与上游；离线/无上游则静默跳过
function checkForUpdates() {
  try {
    execSync('git fetch --quiet origin', { cwd: ROOT, stdio: 'ignore', timeout: 10000 })
    const behind = execSync('git rev-list --count HEAD..@{u}', { cwd: ROOT, encoding: 'utf8' }).trim()
    if (behind !== '0') {
      console.log(`\n  ⚠ 有新版本：本地落后远端 ${behind} 个提交，跑 \`toolkit update\` 更新`)
    }
  } catch {
    // 离线、无上游或无网络：静默跳过，不干扰 list 输出
  }
}

function describe(comp) {
  const parts = []
  const mcpNames = Object.keys(comp.provides?.mcpServers || {})
  const skillNames = (comp.provides?.skills || []).map((s) => s.name)
  if (mcpNames.length) parts.push(`MCP:${mcpNames.join('/')}`)
  if (skillNames.length) parts.push(`skill:${skillNames.join('/')}`)
  const dep = (comp.dependsOn || []).length ? ` 依赖[${comp.dependsOn.join(', ')}]` : ''
  return `${comp.name}（${parts.join(', ')}）${dep}`
}

// ---------- list ----------
function cmdList() {
  checkProject()
  for (const c of components) {
    const mark = isInstalled(c) ? '已装' : '未装'
    console.log(`  ${mark}  ${describe(c)}`)
  }
  if (!components.length) console.log('  （注册表为空）')
  checkForUpdates()
}

// ---------- install ----------
async function cmdInstall() {
  checkProject()
  // 结构校验：安装前先保证注册表无环、无悬空引用
  const errors = validateRegistry(ROOT, components)
  if (errors.length) {
    console.error('[toolkit] 注册表校验失败：')
    errors.forEach((e) => console.error('  - ' + e))
    process.exit(1)
  }

  let target
  if (defaultAll) {
    target = components.map((c) => c.name)
  } else if (names.length) {
    target = names
    for (const n of names) {
      if (!map[n]) {
        console.error(`[toolkit] 未知组件: ${n}（可用: ${components.map((c) => c.name).join(', ')}）`)
        process.exit(1)
      }
    }
  } else if (!process.stdin.isTTY) {
    // 非 TTY（管道/CI/Claude Code 里让 AI 跑）：列出组件 + 引导命令行，不尝试交互
    listAndGuide()
    return
  } else {
    // TTY 终端：交互式多选（空格选/回车确认，@clack/prompts 跨平台处理 PowerShell/cmd/Git Bash）
    const selected = await multiselect({
      message: '选择要安装的组件（空格选中，回车确认）',
      options: components.map((c) => ({
        value: c.name,
        label: c.name,
        hint: isInstalled(c) ? '已装' : describe(c),
      })),
      required: false,
    })
    if (isCancel(selected)) {
      console.log('已取消，未安装任何组件。')
      return
    }
    target = selected
  }

  // 依赖展开 + 拓扑排序
  const expanded = resolveDeps(target, components)
  const order = topoSort(expanded, components)

  console.log(`\n将安装 ${order.length} 个组件：${order.join(' -> ')}\n`)
  for (const n of order) {
    const c = map[n]
    const already = isInstalled(c)
    if (already) {
      console.log(`  ✓ ${n}（已装，覆盖更新）`)
    } else {
      console.log(`  + ${n}`)
    }
    installComponent(ROOT, PROJECT, c)
  }
  console.log(`\n完成。MCP 已写入 ${path.join(PROJECT, '.mcp.json')}，skill 已部署到 ${path.join(PROJECT, '.claude', 'skills')}。`)
  console.log('提示：MCP 工具需重启 Claude Code 会话生效；skill 由会话动态发现。')
}

function listAndGuide() {
  console.log('可用组件：')
  components.forEach((c, i) => {
    console.log(`  ${i + 1}. ${describe(c)}  [${isInstalled(c) ? '已装' : '未装'}]`)
  })
  console.log('\n请用命令行指定要安装的组件：')
  console.log('  toolkit install --all              安装全部')
  console.log('  toolkit install <名字> [名字...]    安装指定（如 toolkit install zentao sys-login）')
}

// ---------- uninstall ----------
function cmdUninstall() {
  checkProject()
  if (!names.length) {
    console.error('[toolkit] 用法: node scripts/install.js uninstall <组件名...>')
    process.exit(1)
  }
  for (const n of names) {
    if (!map[n]) {
      console.error(`[toolkit] 未知组件: ${n}`)
      process.exit(1)
    }
    const dependents = reverseDependents(PROJECT, n, components)
    if (dependents.length) {
      console.error(`[toolkit] 无法卸载 ${n}：已被 ${dependents.join(', ')} 依赖。请先卸载依赖它的组件。`)
      process.exit(1)
    }
    uninstallComponent(PROJECT, map[n])
    console.log(`  - 已卸载 ${n}`)
  }
}

// ---------- update ----------
async function cmdUpdate() {
  checkProject()
  console.log('[toolkit] 拉取最新代码…')
  gitPull()
  reloadRegistry() // 拉取后重读注册表，让新组件/新 skill 路径生效
  await cmdInstall()
}

// ---------- 分发 ----------
if (cmd === 'list') cmdList()
else if (cmd === 'install') await cmdInstall()
else if (cmd === 'update') await cmdUpdate()
else if (cmd === 'uninstall') cmdUninstall()
else {
  console.error(`[toolkit] 未知命令: ${cmd}（支持 list / install / update / uninstall）`)
  process.exit(1)
}
