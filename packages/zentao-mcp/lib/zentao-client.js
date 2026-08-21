import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex')

export class ZentaoError extends Error {}

/**
 * 禅道 12.x 会话客户端（web session 登录方式）
 * 登录算法: password = md5(md5(明文密码) + verifyRand)
 * 凭证来源: config.json (baseUrl / account / password)
 * 会话持久化: .session.json (cookies)，重启后免登录
 */
export class ZentaoClient {
  constructor(config) {
    if (!config?.baseUrl) throw new ZentaoError('缺少 baseUrl：请配置 config.json 或环境变量 ZENTAO_BASE_URL')
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.account = config.account || ''
    this.password = config.password || ''
    const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    this.tmpDir = config.tmpDir || path.join(pkgDir, 'tmp')
    this.sessionFile = path.join(pkgDir, '.session.json')
    this.cookies = new Map()
    this._loadSession()
  }

  // ---------- cookie 管理 ----------
  _loadSession() {
    try {
      const j = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'))
      this.cookies = new Map(j.cookies || [])
    } catch {
      /* 无会话文件 */
    }
  }

  _saveSession() {
    try {
      fs.writeFileSync(this.sessionFile, JSON.stringify({ cookies: [...this.cookies] }, null, 2))
    } catch {
      /* 忽略写入失败 */
    }
  }

  _storeCookies(res) {
    const setCookies = res.headers.getSetCookie?.() || []
    let changed = false
    for (const c of setCookies) {
      const [pair] = c.split(';')
      const eq = pair.indexOf('=')
      if (eq > 0) {
        this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
        changed = true
      }
    }
    if (changed) this._saveSession()
  }

  _cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  // ---------- 基础请求 ----------
  async fetch(p, opts = {}) {
    // 红线：禅道只读。除登录表单外，拦截一切非 GET/HEAD 请求，
    // 保证任何工具都无法通过本客户端对禅道做写操作。
    const method = (opts.method || 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD' && !p.startsWith('/user-login.html')) {
      throw new ZentaoError(`红线拦截：zentao-mcp 仅只读，禁止 ${method} 请求 ${p}`)
    }
    const url = p.startsWith('http')
      ? p
      : `${this.baseUrl}${p.startsWith('/') ? '' : '/'}${p}`
    const res = await fetch(url, {
      redirect: 'manual',
      ...opts,
      headers: {
        'User-Agent': 'Mozilla/5.0 (zentao-mcp)',
        Cookie: this._cookieHeader(),
        ...(opts.headers || {}),
      },
    })
    this._storeCookies(res)
    return res
  }

  /** 跟随重定向（用于文件下载等） */
  async follow(res, max = 5) {
    let r = res
    let n = 0
    while ([301, 302, 303, 307, 308].includes(r.status) && n++ < max) {
      const loc = r.headers.get('location')
      if (!loc) break
      r = await this.fetch(loc.startsWith('http') ? loc : new URL(loc, this.baseUrl).toString())
    }
    return r
  }

  // ---------- 登录 ----------
  async login() {
    if (!this.account || !this.password) {
      throw new ZentaoError('config.json 中未配置 account / password')
    }
    const loginPage = await this.fetch('/user-login.html')
    const html = await loginPage.text()
    if (/captcha/i.test(html)) {
      throw new ZentaoError('登录页出现验证码（可能失败次数过多），请稍后重试或先在浏览器登录一次')
    }
    const m =
      html.match(/id='verifyRand'\s+value='([^']+)'/) ||
      html.match(/id="verifyRand"[^>]*value="([^"]+)"/)
    if (!m) throw new ZentaoError('未找到 verifyRand，登录页结构可能已变化')
    const rand = m[1]
    const body = new URLSearchParams({
      account: this.account,
      password: md5(md5(this.password) + rand),
      verifyRand: rand,
      referer: `${this.baseUrl}/`,
      'keepLogin[]': 'on',
    })
    const res = await this.fetch('/user-login.html?t=json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* 非 JSON 返回，走兜底检测 */
    }
    if (json?.result === 'success') return true
    if (json?.result === 'fail') {
      throw new ZentaoError(`登录失败: ${json.message || '账号或密码错误'}`)
    }
    if (await this.isLoggedIn()) return true
    throw new ZentaoError('登录失败，请检查 config.json 中的账号密码')
  }

  async isLoggedIn() {
    try {
      const res = await this.fetch('/index.html')
      if ([301, 302, 303].includes(res.status)) {
        const loc = res.headers.get('location') || ''
        return !loc.includes('user-login')
      }
      if (res.status !== 200) return false
      // 会话失效时禅道可能返回 200 + script 跳转登录页，需检测正文
      const body = await res.text()
      return !body.includes('user-login')
    } catch {
      return false
    }
  }

  async ensureLoggedIn() {
    if (await this.isLoggedIn()) return
    await this.login()
  }

  // ---------- 数据获取 ----------
  /**
   * GET 页面返回 HTML。若未登录被重定向到登录页，自动重新登录后重试一次。
   * 禅道对无权限页面返回 200 + script 跳转 user-deny，故在正文中检测。
   */
  async getHtml(p, retried = false) {
    await this.ensureLoggedIn()
    const res = await this.fetch(p)
    if ([301, 302, 303].includes(res.status)) {
      const loc = res.headers.get('location') || ''
      if (loc.includes('user-login') && !retried) {
        await this.login()
        return this.getHtml(p, true)
      }
      throw new ZentaoError(`请求 ${p} 被重定向到: ${loc}`)
    }
    const text = await res.text()
    if (text.includes('user-deny')) {
      throw new ZentaoError(`当前账号无权限访问 ${p}`)
    }
    // 会话失效：200 + script 跳转登录页，重新登录重试一次
    if (text.includes('user-login') && !retried) {
      await this.login()
      return this.getHtml(p, true)
    }
    return text
  }

  /** 下载二进制（附件/图片），返回 buffer 和 content-type */
  async fetchBinary(url, retried = false) {
    await this.ensureLoggedIn()
    let res = await this.fetch(url)
    if ([301, 302, 303].includes(res.status)) {
      const loc = res.headers.get('location') || ''
      if (loc.includes('user-login') && !retried) {
        await this.login()
        return this.fetchBinary(url, true)
      }
      res = await this.follow(res)
    }
    if (res.status !== 200) throw new ZentaoError(`下载失败: HTTP ${res.status} (${url})`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    // 会话失效时可能返回 200 + HTML 登录跳转载体
    if (!retried && /text\/html/.test(contentType)) {
      const head = buffer.subarray(0, 500).toString('utf8')
      if (head.includes('user-login')) {
        await this.login()
        return this.fetchBinary(url, true)
      }
    }
    return { buffer, contentType }
  }

  /** 把可能是相对路径的 URL 转成绝对 URL；校验是否在禅道域内 */
  resolveUrl(u) {
    const abs = u.startsWith('http') ? u : new URL(u, `${this.baseUrl}/`).toString()
    if (!abs.startsWith(this.baseUrl)) {
      throw new ZentaoError(`URL 不在禅道域内，出于安全拒绝抓取: ${u}`)
    }
    return abs
  }

  ensureTmpDir() {
    fs.mkdirSync(this.tmpDir, { recursive: true })
    return this.tmpDir
  }
}
