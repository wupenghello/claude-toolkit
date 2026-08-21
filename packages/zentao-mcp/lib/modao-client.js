import fs from 'node:fs'
import { chromium } from 'playwright-core'

export class ModaoError extends Error {}

const CHROME_CANDIDATES = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
}

/** 跨平台查找系统浏览器；可用环境变量 ZENTAO_MCP_CHROME 显式指定 */
export function findChromePath() {
  const override = process.env.ZENTAO_MCP_CHROME
  if (override && fs.existsSync(override)) return override
  const list = CHROME_CANDIDATES[process.platform] || CHROME_CANDIDATES.linux
  for (const p of list) if (fs.existsSync(p)) return p
  throw new ModaoError(
    `未找到 Chrome/Edge（${process.platform}），墨刀渲染需要系统浏览器；可用环境变量 ZENTAO_MCP_CHROME 指定路径`,
  )
}

/**
 * 墨刀（modao.cc）只读客户端：headless 系统 Chrome 登录 + 渲染共享原型页。
 * 不做任何写操作；登录仅用于获取查看会话。
 */
export class ModaoClient {
  constructor({ modao, sessionFile, tmpDir }) {
    this.cfg = modao || {}
    this.sessionFile = sessionFile
    this.tmpDir = tmpDir
  }

  _chrome() {
    return findChromePath()
  }

  async _launch() {
    return chromium.launch({ executablePath: this._chrome(), headless: true })
  }

  /** 账号密码登录，成功后 storageState 存到 sessionFile */
  async login(browser) {
    if (!this.cfg.account || !this.cfg.password) {
      throw new ModaoError('墨刀需要登录：请在 config.json 的 modao 字段配置账号密码')
    }
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
    const page = await ctx.newPage()
    let serverError = null
    page.on('response', async (r) => {
      if (r.url().includes('/go/v1/auth/loginXhx') && r.status() >= 400) {
        try {
          serverError = (await r.json()).errors
        } catch {
          /* ignore */
        }
      }
    })
    try {
      await page.goto('https://modao.cc/signin', { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForSelector('.right-top-switch-sec', { state: 'attached', timeout: 30000 })
      await page.waitForTimeout(1000)
      await page.click('.right-top-switch-sec') // 二维码 → 表单
      await page.waitForTimeout(1000)
      await page.getByText('密码登录', { exact: true }).first().click()
      await page.waitForTimeout(800)
      await page.fill('input[placeholder="请输入手机号/邮箱"]', this.cfg.account)
      await page.fill('#auth-box input[type="password"]', this.cfg.password)
      // 自定义复选框：直接对隐藏 input 触发 click 才能进 React 状态
      await page.evaluate(() => document.querySelector('#auth-box input[type="checkbox"]').click())
      await page.click('#auth-box span.btn-text:has-text("立即登录")')
      await page.waitForURL((u) => !u.includes('auth_box') && !u.includes('signin'), { timeout: 20000 })
      await ctx.storageState({ path: this.sessionFile })
    } catch {
      throw new ModaoError(serverError || '墨刀登录失败（可能是验证码/风控），请稍后重试或在浏览器手动登录后重试')
    } finally {
      await ctx.close()
    }
  }

  /**
   * 打开墨刀共享原型页，返回 { screenshot, title, text, url }。
   * 未登录被重定向时自动登录一次重试。
   */
  async fetchProto(url, retried = false) {
    if (!/^https:\/\/([a-z0-9-]+\.)?modao\.cc\//.test(url)) {
      throw new ModaoError(`非墨刀链接，拒绝渲染: ${url}`)
    }
    const browser = await this._launch()
    try {
      const hasSession = fs.existsSync(this.sessionFile)
      const ctx = hasSession
        ? await browser.newContext({ storageState: this.sessionFile, viewport: { width: 1600, height: 1000 } })
        : await browser.newContext({ viewport: { width: 1600, height: 1000 } })
      const page = await ctx.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(2000)
      const needLogin = page.url().includes('signin') || page.url().includes('auth_box')
      if (needLogin) {
        await ctx.close()
        if (retried) throw new ModaoError('墨刀会话无效且重新登录失败')
        await this.login(browser)
        return this.fetchProto(url, true)
      }
      // 等待原型画布渲染
      await page.waitForTimeout(6000)
      // 移除"欢迎来到墨刀"横幅（截图用途；× 为 SVG 无法文本匹配，直接删 DOM）
      try {
        await page.evaluate(() => {
          const nodes = [...document.querySelectorAll('div')].filter((d) =>
            (d.textContent || '').includes('欢迎来到墨刀'),
          )
          let el = nodes.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0]
          while (el?.parentElement) {
            const cs = getComputedStyle(el)
            if (cs.position === 'fixed' || cs.position === 'absolute') break
            el = el.parentElement
          }
          el?.remove()
        })
        await page.waitForTimeout(500)
      } catch {
        /* ignore */
      }
      const screenshot = await page.screenshot()
      const info = await page.evaluate(() => ({
        title: document.title,
        text: document.body.innerText.slice(0, 4000),
      }))
      try {
        await ctx.storageState({ path: this.sessionFile })
      } catch {
        /* ignore */
      }
      await ctx.close()
      return { screenshot, ...info, url: page.url() }
    } finally {
      await browser.close()
    }
  }
}
