// claude-toolkit 核心逻辑测试（不碰真实项目，用 os.tmpdir 临时目录）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadRegistry,
  validateRegistry,
  byName,
  resolveDeps,
  topoSort,
  mergeMcpConfig,
  removeMcpFromConfig,
  isMcpInstalled,
  isSkillInstalled,
  componentInstalled,
  installComponent,
  uninstallComponent,
  reverseDependents,
} from '../lib/registry-core.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const tmpProjects = []
function tmpProject() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'))
  fs.mkdirSync(path.join(d, '.claude', 'skills'), { recursive: true })
  tmpProjects.push(d)
  return d
}
afterEach(() => {
  for (const d of tmpProjects) fs.rmSync(d, { recursive: true, force: true })
  tmpProjects.length = 0
})

describe('真实 registry.json', () => {
  it('能加载且结构校验零错误（provides 路径真实存在、无循环依赖）', () => {
    const registry = loadRegistry(ROOT)
    expect(registry.components.length).toBeGreaterThan(0)
    const errors = validateRegistry(ROOT, registry.components)
    expect(errors).toEqual([])
  })
  it('三个组件名唯一', () => {
    const registry = loadRegistry(ROOT)
    const names = registry.components.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('zentao')
    expect(names).toContain('sys-login')
    expect(names).toContain('mcp-scaffold')
  })
})

describe('依赖解析（拓扑排序）', () => {
  const comps = [
    { name: 'a', dependsOn: [] },
    { name: 'b', dependsOn: ['a'] },
    { name: 'c', dependsOn: ['a', 'b'] },
    { name: 'd', dependsOn: [] },
  ]
  it('resolveDeps 递归展开依赖', () => {
    expect(resolveDeps(['c'], comps).sort()).toEqual(['a', 'b', 'c'])
  })
  it('topoSort 依赖在前', () => {
    const order = topoSort(resolveDeps(['c'], comps), comps)
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'))
  })
  it('检测循环依赖', () => {
    const cyclic = [
      { name: 'a', dependsOn: ['b'] },
      { name: 'b', dependsOn: ['a'] },
    ]
    const errors = validateRegistry(ROOT, cyclic)
    expect(errors.some((e) => e.includes('循环依赖'))).toBe(true)
  })
  it('检测悬空依赖', () => {
    const dangling = [{ name: 'a', dependsOn: ['nonexistent'] }]
    const errors = validateRegistry(ROOT, dangling)
    expect(errors.some((e) => e.includes('未在注册表'))).toBe(true)
  })
})

describe('MCP 合并保留第三方条目', () => {
  it('mergeMcpConfig 增/改自制条目，保留 apifox 第三方', () => {
    const project = tmpProject()
    // 预置一个第三方条目
    fs.writeFileSync(
      path.join(project, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'API 文档': { command: 'npx.cmd', args: ['-y', 'apifox'] } } }, null, 2),
    )
    mergeMcpConfig(ROOT, project, {
      zentao: { command: 'node', args: ['packages/zentao-mcp/index.js'], env: {} },
    })
    const mcp = JSON.parse(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers['API 文档']).toBeTruthy() // 第三方保留
    expect(mcp.mcpServers.zentao.command).toBe('node')
    expect(mcp.mcpServers.zentao.args[0]).toBe(path.join(ROOT, 'packages/zentao-mcp/index.js')) // 相对转绝对
  })
  it('removeMcpFromConfig 只删指定条目', () => {
    const project = tmpProject()
    fs.writeFileSync(
      path.join(project, '.mcp.json'),
      JSON.stringify({ mcpServers: { keep: { command: 'x' }, drop: { command: 'y' } } }, null, 2),
    )
    removeMcpFromConfig(project, ['drop'])
    const mcp = JSON.parse(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers.keep).toBeTruthy()
    expect(mcp.mcpServers.drop).toBeUndefined()
  })
  it('损坏的 .mcp.json 被备份后重建，不崩', () => {
    const project = tmpProject()
    fs.writeFileSync(path.join(project, '.mcp.json'), '{broken json')
    mergeMcpConfig(ROOT, project, { zentao: { command: 'node', args: ['packages/zentao-mcp/index.js'], env: {} } })
    // 原损坏内容被备份
    expect(fs.readFileSync(path.join(project, '.mcp.json.bak'), 'utf8')).toBe('{broken json')
    // 新文件可解析且含新条目
    const mcp = JSON.parse(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers.zentao).toBeTruthy()
  })
})

describe('安装 / 卸载 / 反向依赖', () => {
  // 用临时 rootDir（而非真实仓库），installComponent 的 from 路径指向临时目录，不污染仓库
  function tmpRootWithSkill(name) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-root-'))
    const src = path.join(root, 'packages', 'skills', name)
    fs.mkdirSync(src, { recursive: true })
    fs.writeFileSync(path.join(src, 'SKILL.md'), `---\nname: ${name}\ndescription: test\n---\n`)
    tmpProjects.push(root)
    return root
  }
  const comp = {
    name: 'x',
    provides: { skills: [{ name: 'x', from: 'packages/skills/x' }] },
    dependsOn: [],
  }
  it('installComponent 部署 skill，componentInstalled 判定', () => {
    const root = tmpRootWithSkill('x')
    const project = tmpProject()
    expect(componentInstalled(project, comp)).toBe(false)
    installComponent(root, project, comp)
    expect(isSkillInstalled(project, 'x')).toBe(true)
    expect(componentInstalled(project, comp)).toBe(true)
  })
  it('uninstallComponent 删除 skill', () => {
    const root = tmpRootWithSkill('x')
    const project = tmpProject()
    installComponent(root, project, comp)
    uninstallComponent(project, comp)
    expect(isSkillInstalled(project, 'x')).toBe(false)
  })
  it('reverseDependents 找出已装且依赖目标组件的组件', () => {
    const comps = [
      { name: 'base', dependsOn: [], provides: { skills: [{ name: 'base', from: 'packages/skills/base' }] } },
      { name: 'user', dependsOn: ['base'], provides: { skills: [{ name: 'user', from: 'packages/skills/user' }] } },
    ]
    const project = tmpProject()
    // 未装任何组件，反向依赖应空
    expect(reverseDependents(project, 'base', comps)).toEqual([])
    // 装上 user（它 dependsOn base），此时卸载 base 应发现 user 依赖它
    const root = tmpRootWithSkill('user')
    installComponent(root, project, comps[1])
    expect(reverseDependents(project, 'base', comps)).toEqual(['user'])
  })
})
