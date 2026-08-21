import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../lib/config.js'

describe('loadConfig', () => {
  it('env 优先覆盖 config.json', () => {
    vi.stubEnv('ZENTAO_BASE_URL', 'http://env.example/zentao')
    vi.stubEnv('ZENTAO_ACCOUNT', 'envuser')
    vi.stubEnv('ZENTAO_PASSWORD', 'envpass')
    vi.stubEnv('MODAO_ACCOUNT', 'envmodao')
    const c = loadConfig()
    expect(c.baseUrl).toBe('http://env.example/zentao')
    expect(c.account).toBe('envuser')
    expect(c.password).toBe('envpass')
    expect(c.modao.account).toBe('envmodao')
    vi.unstubAllEnvs()
  })

  it('env 未设置时保留 config.json 原值', () => {
    const c = loadConfig()
    expect(c.baseUrl).toBeTruthy()
    expect(c.account).toBeTruthy()
  })
})
