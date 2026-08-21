// apifox config.js 单元测试（纯函数，用 os.tmpdir 临时文件，无外部依赖）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig, resolveProject, isPlaceholderToken, PROJECT_KEYS } from '../packages/apifox-mcp/lib/config.js'

const tmpDirs = []
function tmpFile(content) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'apifox-config-'))
  tmpDirs.push(d)
  const f = path.join(d, 'config.json')
  if (content !== undefined) fs.writeFileSync(f, content)
  return f
}
afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true })
  tmpDirs.length = 0
})

const validConfig = {
  token: 'afxp_real_token_123',
  projects: {
    erp: { id: '7718065', name: 'ERP 接口聚合' },
    wbzl: { id: '6574890', name: '物泊智链接口聚合' },
  },
}

describe('isPlaceholderToken', () => {
  it('识别占位文案与空值', () => {
    expect(isPlaceholderToken('')).toBe(true)
    expect(isPlaceholderToken(undefined)).toBe(true)
    expect(isPlaceholderToken('在 Apifox 右上角头像 → 生成')).toBe(true)
    expect(isPlaceholderToken('请粘贴你的 access token')).toBe(true)
  })
  it('识别真实 token', () => {
    expect(isPlaceholderToken('afxp_d39abc')).toBe(false)
    expect(isPlaceholderToken('APS-qMnI')).toBe(false)
  })
})

describe('loadConfig', () => {
  it('缺文件返回带路径指引的 error', () => {
    const r = loadConfig(path.join(os.tmpdir(), 'nonexistent', 'config.json'))
    expect(r.error).toContain('config.json 不存在')
  })
  it('解析失败返回 error', () => {
    const f = tmpFile('{broken json')
    expect(loadConfig(f).error).toContain('解析失败')
  })
  it('正常返回原始对象', () => {
    const f = tmpFile(JSON.stringify(validConfig))
    expect(loadConfig(f).token).toBe('afxp_real_token_123')
  })
})

describe('resolveProject', () => {
  it('缺 project key 返回 error 并列可用 key', () => {
    const r = resolveProject(validConfig, 'nope')
    expect(r.error).toContain('projects.nope')
    expect(r.error).toContain(PROJECT_KEYS.join(', '))
  })
  it('占位 token 返回 error', () => {
    const r = resolveProject({ ...validConfig, token: '请粘贴 token' }, 'erp')
    expect(r.error).toContain('token 未填')
  })
  it('正常返回 id/name/token', () => {
    expect(resolveProject(validConfig, 'erp')).toEqual({ id: '7718065', name: 'ERP 接口聚合', token: 'afxp_real_token_123' })
    expect(resolveProject(validConfig, 'wbzl').id).toBe('6574890')
  })
  it('loaded.error 透传', () => {
    expect(resolveProject({ error: 'x' }, 'erp').error).toBe('x')
  })
})
