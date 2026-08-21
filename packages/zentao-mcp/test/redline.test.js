import { describe, expect, it, vi } from 'vitest'
import { ZentaoClient } from '../lib/zentao-client.js'

const client = new ZentaoClient({ baseUrl: 'http://127.0.0.1:9', account: 'a', password: 'b' })

describe('只读红线', () => {
  it('拦截非 GET 且不发起网络请求', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''))
    for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      await expect(client.fetch('/bug-edit-1.html', { method: m })).rejects.toThrow(/红线拦截/)
    }
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('登录表单豁免', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''))
    await expect(client.fetch('/user-login.html', { method: 'POST' })).resolves.toBeTruthy()
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('GET 不受红线影响', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'))
    const res = await client.fetch('/bug-view-1.html')
    expect(await res.text()).toBe('ok')
    spy.mockRestore()
  })
})

describe('resolveUrl 同域校验', () => {
  it('拒绝域外 URL', () => {
    expect(() => client.resolveUrl('https://evil.com/x')).toThrow(/不在禅道域内/)
  })
  it('相对路径补全为绝对 URL', () => {
    expect(client.resolveUrl('/zentao/file-read-1.png')).toBe('http://127.0.0.1:9/zentao/file-read-1.png')
  })
})
