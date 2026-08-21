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

const registry = loadRegistry(ROOT)
const components = registry.components
const map = byName(components)

const isInstalled = (c) => componentInstalled(PROJECT, c)

function checkProject() {
  if (!fs.existsSync(PROJECT)) {
    console.error(`[toolkit] 项目目录不存在: ${PROJECT}`)
    console.error('        请用 --project=<你的项目路径> 指定')
    process.exit(1)
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
}

// ---------- install ----------
function cmdInstall() {
  checkProject()
  // 结构校验：安装前先保证注册表无环、无悬空引用
  const errors = validateRegistry(ROOT, components)
  if (errors.length) {
    console.error('[toolkit] 注册表校验失败：')
    errors.forEach((e) => console.error('  - ' + e))
    process.exit(1)
  }

  let target
  if (all) {
    target = components.map((c) => c.name)
  } else if (names.length) {
    target = names
    for (const n of names) {
      if (!map[n]) {
        console.error(`[toolkit] 未知组件: ${n}（可用: ${components.map((c) => c.name).join(', ')}）`)
        process.exit(1)
      }
    }
  } else {
    // 无参数：列出组件 + 用法引导（不做 readline 交互，Windows 终端兼容性差）
    console.log('可用组件：')
    components.forEach((c, i) => {
      console.log(`  ${i + 1}. ${describe(c)}  [${isInstalled(c) ? '已装' : '未装'}]`)
    })
    console.log('\n请用命令行指定要安装的组件：')
    console.log('  toolkit install --all              安装全部')
    console.log('  toolkit install <名字> [名字...]    安装指定（如 toolkit install zentao sys-login）')
    return
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

// ---------- 分发 ----------
if (cmd === 'list') cmdList()
else if (cmd === 'install' || cmd === 'update') cmdInstall() // update 即 install 的覆盖式更新别名
else if (cmd === 'uninstall') cmdUninstall()
else {
  console.error(`[toolkit] 未知命令: ${cmd}（支持 list / install / update / uninstall）`)
  process.exit(1)
}
