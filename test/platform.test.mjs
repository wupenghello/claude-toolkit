// lib/platform.js 测试：默认项目解析的优先级链（不碰真实项目，用 os.tmpdir 临时目录）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDefaultProject, defaultProjectDir } from '../lib/platform.js'

const savedEnv = process.env.WBSCF_ROOT
const tmpDirs = []
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-platform-'))
  tmpDirs.push(d)
  return d
}
afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true })
  tmpDirs.length = 0
  if (savedEnv === undefined) delete process.env.WBSCF_ROOT
  else process.env.WBSCF_ROOT = savedEnv
})

describe('resolveDefaultProject 优先级链', () => {
  it('WBSCF_ROOT 指向真实目录时优先采用', () => {
    const envDir = tmp()
    process.env.WBSCF_ROOT = envDir
    const r = resolveDefaultProject(path.join(tmp(), 'claude-toolkit'))
    expect(r.dir).toBe(envDir)
    expect(r.source).toContain('WBSCF_ROOT')
  })

  it('WBSCF_ROOT 指向不存在的目录时跳过，落到同级探测', () => {
    const dir = tmp()
    const root = path.join(dir, 'claude-toolkit')
    fs.mkdirSync(root, { recursive: true })
    fs.mkdirSync(path.join(dir, 'wbscf-web'), { recursive: true })
    process.env.WBSCF_ROOT = path.join(dir, '不存在的残留值')
    const r = resolveDefaultProject(root)
    expect(r.dir).toBe(path.join(dir, 'wbscf-web'))
    expect(r.source).toContain('同级')
  })

  it('无环境变量时取仓库同级的 wbscf-web', () => {
    const dir = tmp()
    const root = path.join(dir, 'claude-toolkit')
    fs.mkdirSync(root, { recursive: true })
    fs.mkdirSync(path.join(dir, 'wbscf-web'), { recursive: true })
    delete process.env.WBSCF_ROOT
    const r = resolveDefaultProject(root)
    expect(r.dir).toBe(path.join(dir, 'wbscf-web'))
    expect(r.source).toContain('同级')
  })

  it('都探测不到时落到平台默认（按平台断言）', () => {
    delete process.env.WBSCF_ROOT
    const expected =
      process.platform === 'win32'
        ? 'D:/projects/wbscf-web'
        : path.join(os.homedir(), 'projects', 'wbscf-web')
    const r = resolveDefaultProject(path.join(tmp(), 'claude-toolkit'))
    expect(r.dir).toBe(expected)
    expect(r.source).toContain('平台默认')
  })

  it('defaultProjectDir 只返回路径，与 resolveDefaultProject 一致', () => {
    const dir = tmp()
    const root = path.join(dir, 'claude-toolkit')
    fs.mkdirSync(root, { recursive: true })
    fs.mkdirSync(path.join(dir, 'wbscf-web'), { recursive: true })
    delete process.env.WBSCF_ROOT
    expect(defaultProjectDir(root)).toBe(resolveDefaultProject(root).dir)
  })
})
