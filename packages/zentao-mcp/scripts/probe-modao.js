/**
 * 墨刀探针：login 登录存会话 / fetch <url> 带会话打开共享原型
 * 用法:
 *   node scripts/probe-modao.js login
 *   node scripts/probe-modao.js fetch "https://modao.cc/proto/xxx/sharing?..."
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { loadConfig } from '../lib/config.js'
import { findChromePath } from '../lib/modao-client.js'

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = loadConfig(pkgDir)
const SESSION = path.join(pkgDir, '.modao-session.json')
const CHROME = findChromePath()

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const [cmd, url] = process.argv.slice(2)

if (cmd === 'login') {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('https://modao.cc/signin', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.right-top-switch-sec', { state: 'attached', timeout: 30000 })
  await page.waitForTimeout(1000)
  await page.click('.right-top-switch-sec')
  await page.waitForTimeout(1000)
  await page.getByText('密码登录', { exact: true }).first().click()
  await page.waitForTimeout(500)
  await page.fill('input[placeholder="请输入手机号/邮箱"]', config.modao.account)
  await page.fill('#auth-box input[type="password"]', config.modao.password)
  const cb = page.locator('#auth-box input[type="checkbox"]')
  if (await cb.count()) {
    // 自定义样式复选框：点击可见的协议标签；不行就直接对 input 触发 click
    try {
      await page.click('.confirm-agreement', { timeout: 3000 })
    } catch {
      await cb.evaluate((el) => el.click())
    }
  }
  await page.click('button:has-text("立即登录"), #auth-box span.btn-text:has-text("立即登录")')
  try {
    await page.waitForURL((u) => !u.includes('auth_box') && !u.includes('signin'), { timeout: 30000 })
  } catch {
    console.log('登录后 URL:', page.url())
    console.log('页面文本:', (await page.evaluate(() => document.querySelector('#auth-box')?.innerText || '')).slice(0, 300))
    await browser.close()
    process.exit(1)
  }
  console.log('登录成功, URL:', page.url())
  await ctx.storageState({ path: SESSION })
  console.log('会话已保存:', SESSION)
} else if (cmd === 'fetch') {
  const ctx = fs.existsSync(SESSION)
    ? await browser.newContext({ storageState: SESSION })
    : await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(8000)
  console.log('URL:', page.url())
  console.log('title:', await page.title())
  if (page.url().includes('signin') || page.url().includes('auth_box')) {
    console.log('!! 未登录，被重定向到登录页')
    await browser.close()
    process.exit(1)
  }
  fs.mkdirSync(path.join(pkgDir, 'tmp'), { recursive: true })
  await page.screenshot({ path: path.join(pkgDir, 'tmp/modao.png') })
  console.log('截图已存 tmp/modao.png')
  const info = await page.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 1500),
    canvases: document.querySelectorAll('canvas').length,
    screens: [...document.querySelectorAll('[class*=screen-name], [class*=ScreenName], [class*=page-item], [class*=PageItem]')].map((e) => e.textContent.trim()).slice(0, 30),
  }))
  console.log('canvases:', info.canvases)
  console.log('screens:', JSON.stringify(info.screens))
  console.log('--- bodyText ---')
  console.log(info.bodyText)
} else {
  console.log('用法: probe-modao.js login | fetch <url>')
}
await browser.close()
