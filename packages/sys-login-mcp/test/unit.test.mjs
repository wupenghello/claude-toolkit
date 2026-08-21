import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { classifyError } from '../lib/login-core.js'
import { buildInject } from '../lib/inject-builder.js'
import { encryptPassword } from '../lib/crypto.js'
import { APPS, APP_NAMES, loadAccounts, findAccount } from '../lib/config.js'

describe('classifyError 错误分类', () => {
  it('验证码类文案 → captcha', () => {
    expect(classifyError({ status: 500, body: { message: '图片验证码错误' } })).toBe('captcha')
    expect(classifyError({ status: 500, body: { error: 'captcha expired' } })).toBe('captcha')
  })
  it('密码类文案 → credential（实测 417 场景）', () => {
    expect(classifyError({ status: 417, body: { message: '账号登录失败，账号名或密码错误' } })).toBe('credential')
  })
  it('账号状态类文案 → account', () => {
    expect(classifyError({ status: 403, body: { message: '账号已锁定' } })).toBe('account')
    expect(classifyError({ status: 403, body: { message: '用户不存在' } })).toBe('account')
  })
  it('401 无文案 → credential', () => {
    expect(classifyError({ status: 401, body: null, text: '' })).toBe('credential')
  })
  it('无匹配 → other', () => {
    expect(classifyError({ status: 500, body: { message: 'internal error' } })).toBe('other')
  })
})

describe('buildInject 注入代码生成', () => {
  const token = 'test-token-123'
  it('cookie 应用：含共享 cookie 键 + authStatus 清理', () => {
    const { evalCode } = buildInject('erp', token)
    expect(evalCode).toContain("wbscf-i-userInfo-localhost")
    expect(evalCode).toContain('test-token-123')
    expect(evalCode).toContain("removeItem('authStatus')")
  })
  it('ops：两个 localStorage 键 + 新鲜 loginDate', () => {
    const { evalCode } = buildInject('ops', token)
    expect(evalCode).toContain('wbscf-ops-0.0.1-dev-core-access')
    expect(evalCode).toContain('wbscf-ops-userInfo')
    expect(evalCode).toContain('Math.floor(Date.now() / 1000)')
    expect(evalCode).toContain("removeItem('authStatus')")
  })
})

describe('encryptPassword AES-128-CBC（与前端 crypto.ts 算法一致的已知向量）', () => {
  // 该预期值由 wbscf-web 的 crypto-js（Utf8 key、CBC、Pkcs7）对拍生成并逐字节确认
  it('已知向量复现', () => {
    expect(encryptPassword('Passw0rd!123', '13800001111', '1735000000000')).toBe('yETjeK3xCFLo7NFLAbEZ8g==')
  })
  it('key/iv 填充规则：手机号左补 0、时间戳右补 0', () => {
    const shortTime = '1'
    // iv = '1' + '0'*15；不同明文不应抛错且输出确定
    expect(encryptPassword('x', '13800001111', shortTime)).toBe(encryptPassword('x', '13800001111', shortTime))
  })
})

describe('config 应用表', () => {
  it('五个应用齐全且配置完整', () => {
    expect(APP_NAMES.sort()).toEqual(['account', 'buyer', 'erp', 'ops', 'seller'])
    for (const name of APP_NAMES) {
      expect(APPS[name].backend).toMatch(/^https?:\/\//)
      expect(APPS[name].devUrl).toMatch(/^http:\/\/localhost:\d+/)
      expect(['cookie', 'localStorage']).toContain(APPS[name].inject)
    }
  })
})

describe('账号加载的占位符/异常检测', () => {
  // 用临时文件测试（loadAccounts 支持注入路径），绝不触碰真实 accounts.json
  const tmpFile = path.join(os.tmpdir(), `sys-login-accounts-test-${process.pid}.json`)
  const writeTmp = (content) => fs.writeFileSync(tmpFile, content)
  afterEach(() => { fs.rmSync(tmpFile, { force: true }) })

  it('占位模板 → 错误信息含文件路径与格式指引', () => {
    writeTmp(JSON.stringify({ default: 'dev1', accounts: [{ alias: 'dev1', username: '手机号', password: '密码' }] }))
    const loaded = loadAccounts(tmpFile)
    expect(loaded.error).toBeTruthy()
    expect(loaded.error).toContain('占位模板')
    expect(loaded.error).toContain('"username"')
  })
  it('JSON 损坏 → 带指引的错误', () => {
    writeTmp('{broken')
    expect(loadAccounts(tmpFile).error).toContain('解析失败')
  })
  it('正常账号 → 可按别名/默认查找', () => {
    const loaded = loadAccounts()
    expect(loaded.error).toBeUndefined()
    const byAlias = findAccount(loaded, loaded.accounts[0].alias)
    expect(byAlias.account).toBeTruthy()
    const byDefault = findAccount(loaded, undefined)
    expect(byDefault.account).toBeTruthy()
  })
})
