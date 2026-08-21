// claude-toolkit 核心逻辑（纯函数，供 CLI 与测试共用）
// 职责：加载注册表、依赖解析（拓扑排序）、MCP/skill 的安装与卸载、状态检测
import fs from 'node:fs'
import path from 'node:path'

export function loadRegistry(rootDir) {
  const f = path.join(rootDir, 'registry.json')
  if (!fs.existsSync(f)) throw new Error(`registry.json 不存在: ${f}`)
  return JSON.parse(fs.readFileSync(f, 'utf8'))
}

export function byName(components) {
  return Object.fromEntries(components.map((c) => [c.name, c]))
}

// 校验注册表：name 唯一、dependsOn 引用存在、无循环依赖、provides 路径存在
export function validateRegistry(rootDir, components) {
  const map = byName(components)
  const errors = []
  const seen = new Set()
  for (const c of components) {
    if (seen.has(c.name)) errors.push(`组件名重复: ${c.name}`)
    seen.add(c.name)
    for (const dep of c.dependsOn || []) {
      if (!map[dep]) errors.push(`组件 ${c.name} 依赖的 ${dep} 未在注册表中声明`)
    }
    // provides 路径存在性
    for (const [mcpName, spec] of Object.entries(c.provides?.mcpServers || {})) {
      for (const a of spec.args || []) {
        if (isRelPath(a) && !fs.existsSync(path.join(rootDir, a))) {
          errors.push(`组件 ${c.name} 的 MCP ${mcpName} args 路径不存在: ${a}`)
        }
      }
    }
    for (const s of c.provides?.skills || []) {
      if (!fs.existsSync(path.join(rootDir, s.from, 'SKILL.md'))) {
        errors.push(`组件 ${c.name} 的 skill ${s.name} 源目录无 SKILL.md: ${s.from}`)
      }
    }
  }
  // 循环依赖检测
  const cycle = findCycle(components, map)
  if (cycle) errors.push(`存在循环依赖: ${cycle.join(' -> ')}`)
  return errors
}

// 判断 registry 里的路径是否相对仓库根（约定：以 packages/ 或 scripts/ 或 lib/ 开头）
function isRelPath(p) {
  return /^(packages|scripts|lib)\//.test(p)
}

export function toAbsPath(rootDir, p) {
  return isRelPath(p) ? path.join(rootDir, p) : p
}

// 返回 names 递归依赖展开后的组件名集合（不含自身未声明的）
export function resolveDeps(names, components) {
  const map = byName(components)
  const want = new Set()
  const add = (n) => {
    if (want.has(n) || !map[n]) return
    want.add(n)
    for (const d of map[n].dependsOn || []) add(d)
  }
  for (const n of names) add(n)
  return [...want]
}

// 拓扑排序（依赖在前）；Kahn 算法。输入已展开依赖的组件名数组
export function topoSort(names, components) {
  const map = byName(components)
  const set = new Set(names)
  const indeg = {}
  const adj = {}
  for (const n of names) {
    indeg[n] = 0
    adj[n] = []
  }
  for (const n of names) {
    for (const d of map[n].dependsOn || []) {
      if (set.has(d)) {
        adj[d].push(n)
        indeg[n]++
      }
    }
  }
  const queue = names.filter((n) => indeg[n] === 0)
  const order = []
  while (queue.length) {
    const n = queue.shift()
    order.push(n)
    for (const m of adj[n]) if (--indeg[m] === 0) queue.push(m)
  }
  return order.length === names.length ? order : names // 有环时退化为原始顺序（校验层已拦截）
}

// 循环依赖检测，返回环路径数组或 null
function findCycle(components, map) {
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = {}
  const stack = []
  const dfs = (n) => {
    color[n] = GRAY
    stack.push(n)
    for (const d of map[n].dependsOn || []) {
      if (!map[d]) continue
      if (color[d] === GRAY) {
        return [...stack.slice(stack.indexOf(d)), d]
      }
      if (color[d] === WHITE) {
        const r = dfs(d)
        if (r) return r
      }
    }
    stack.pop()
    color[n] = BLACK
    return null
  }
  for (const c of components) color[c.name] = WHITE
  for (const c of components) {
    if (color[c.name] === WHITE) {
      const r = dfs(c.name)
      if (r) return r
    }
  }
  return null
}

// ---------- 项目侧安装状态 ----------
export function isMcpInstalled(projectDir, name) {
  const f = path.join(projectDir, '.mcp.json')
  if (!fs.existsSync(f)) return false
  try {
    return !!JSON.parse(fs.readFileSync(f, 'utf8')).mcpServers?.[name]
  } catch {
    return false
  }
}

export function isSkillInstalled(projectDir, name) {
  return fs.existsSync(path.join(projectDir, '.claude', 'skills', name, 'SKILL.md'))
}

export function componentInstalled(projectDir, comp) {
  const mcpNames = Object.keys(comp.provides?.mcpServers || {})
  const skills = comp.provides?.skills || []
  // 无任何资产（既无 MCP 也无 skill）视为未装，避免空集合 every 误判
  if (!mcpNames.length && !skills.length) return false
  const mcpOk = mcpNames.every((n) => isMcpInstalled(projectDir, n))
  const skillOk = skills.every((s) => isSkillInstalled(projectDir, s.name))
  return mcpOk && skillOk
}

// 返回已安装且 dependsOn 包含 name 的组件名数组（用于卸载前反向依赖检查）
export function reverseDependents(projectDir, name, components) {
  return components.filter((c) => {
    if (!(c.dependsOn || []).includes(name)) return false
    return componentInstalled(projectDir, c)
  }).map((c) => c.name)
}

// ---------- 安装 / 卸载 ----------
// 合并 MCP 条目到项目 .mcp.json，保留第三方条目；entries: name -> {command,args,env}
export function mergeMcpConfig(rootDir, projectDir, entries) {
  const f = path.join(projectDir, '.mcp.json')
  let mcp = { mcpServers: {} }
  if (fs.existsSync(f)) {
    try {
      mcp = JSON.parse(fs.readFileSync(f, 'utf8'))
    } catch (e) {
      // 损坏时备份原文件再重建，避免静默丢失第三方配置（如 apifox 的 env token）
      const bak = f + '.bak'
      fs.copyFileSync(f, bak)
      console.error(`[toolkit] 警告: ${f} 解析失败（${e.message}），原文件已备份到 ${bak} 后重建`)
    }
  }
  mcp.mcpServers = mcp.mcpServers || {}
  for (const [name, spec] of Object.entries(entries)) {
    mcp.mcpServers[name] = {
      type: 'stdio',
      command: spec.command,
      args: (spec.args || []).map((a) => toAbsPath(rootDir, a)),
      env: spec.env || {},
    }
  }
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, JSON.stringify(mcp, null, 2) + '\n')
}

export function removeMcpFromConfig(projectDir, names) {
  const f = path.join(projectDir, '.mcp.json')
  if (!fs.existsSync(f)) return
  let mcp
  try {
    mcp = JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    return
  }
  if (!mcp.mcpServers) return
  for (const n of names) delete mcp.mcpServers[n]
  fs.writeFileSync(f, JSON.stringify(mcp, null, 2) + '\n')
}

export function installComponent(rootDir, projectDir, comp) {
  if (comp.provides?.mcpServers) {
    mergeMcpConfig(rootDir, projectDir, comp.provides.mcpServers)
  }
  // 迁移清理：安装新组件后删除指定的旧 MCP 条目（如 apifox 迁入时删掉旧的手写 apifox 条目）
  if (comp.removeMcpServers?.length) {
    removeMcpFromConfig(projectDir, comp.removeMcpServers)
  }
  for (const s of comp.provides?.skills || []) {
    const src = path.join(rootDir, s.from)
    const dest = path.join(projectDir, '.claude', 'skills', s.name)
    fs.rmSync(dest, { recursive: true, force: true })
    fs.cpSync(src, dest, { recursive: true })
  }
}

export function uninstallComponent(projectDir, comp) {
  removeMcpFromConfig(projectDir, Object.keys(comp.provides?.mcpServers || {}))
  for (const s of comp.provides?.skills || []) {
    fs.rmSync(path.join(projectDir, '.claude', 'skills', s.name), { recursive: true, force: true })
  }
}
