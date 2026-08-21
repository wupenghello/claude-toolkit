// 登录主流程：优先 type=auto 免验证码，失败回退 CNN 图片验证码循环
import { encryptPassword } from './crypto.js'
import { recognizeBase64 } from './captcha-image.js'

const CAPTCHA_PATH = '/api/captcha/web/image-captcha?width=120&height=40&length=4'
const LOGIN_PATH = '/api/uaa/web/authentication/sessions'
// 与插件 config.js FILL_MIN_CONF 一致：4 字符置信度最小值低于此值不提交登录，直接换码
const MIN_CONF = 0.75

// 网关对非浏览器请求可能不友好，带上常规浏览器头
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
}

async function apiFetch(url, options = {}) {
  let res
  try {
    res = await fetch(url, {
      ...options,
      headers: { ...BROWSER_HEADERS, ...(options.headers || {}) },
    })
  } catch (e) {
    return { networkError: e.message }
  }
  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: res.status, ok: res.ok, body, text: text.slice(0, 500) }
}

async function fetchCaptcha(backend) {
  const r = await apiFetch(`${backend}${CAPTCHA_PATH}`)
  if (!r.ok || !r.body?.id || !r.body?.imageBase64) {
    return { error: `拉取验证码失败: HTTP ${r.status ?? ''} ${r.networkError ?? r.text ?? ''}`, resp: r }
  }
  return r.body
}

async function postLogin(backend, { username, password, type, captchaId, captchaCode }) {
  const requestTime = String(Date.now())
  const encrypted = encryptPassword(password, username, requestTime)
  const q = new URLSearchParams({ type })
  if (captchaId) {
    q.set('__captcha_id', captchaId)
    q.set('__captcha_code', captchaCode)
  }
  return apiFetch(`${backend}${LOGIN_PATH}?${q.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Request-Time': requestTime },
    body: JSON.stringify({ username, password: encrypted, type }),
  })
}

// 把响应里所有字符串字段拼成一句话，用于错误分类
function messageOf(resp) {
  if (!resp) return ''
  const parts = []
  const walk = (v) => {
    if (typeof v === 'string') parts.push(v)
    else if (v && typeof v === 'object') for (const k of ['message', 'msg', 'error', 'errorDetail', 'errorMessage']) if (v[k]) walk(v[k])
  }
  walk(resp.body)
  if (!parts.length) parts.push(resp.text || '')
  return parts.join(' | ')
}

// 错误分类: captcha（换码重试）| credential（密码错，终止）| account（账号状态问题，终止）| other
export function classifyError(resp) {
  const msg = messageOf(resp)
  if (/验证码|captcha/i.test(msg)) return 'captcha'
  if (/密码|password/i.test(msg)) return 'credential'
  if (/锁定|禁用|冻结|不存在|已失效|账号|账户|用户名|user/i.test(msg)) return 'account'
  if (resp?.status === 401) return 'credential'
  return 'other'
}

function summarize(resp) {
  return `HTTP ${resp?.status ?? ''} ${messageOf(resp) || resp?.text || resp?.networkError || ''}`.trim()
}

/**
 * @returns {ok, token, method:'auto'|'captcha'} 或 {ok:false, error, detail}
 *   error ∈ network | credential | account | captcha_fetch | captcha_format | captcha_exhausted | other
 */
export async function login({ backend, username, password }, { maxRounds = 5, onLog = () => {} } = {}) {
  // 1) type=auto 免验证码（account 前端 autologin 同款；erp/ops 后端是否支持未知，失败自动回退）
  const auto = await postLogin(backend, { username, password, type: 'auto' })
  if (auto.networkError) return { ok: false, error: 'network', detail: auto.networkError }
  if (auto.ok && auto.body?.token) {
    onLog('type=auto 登录成功（免验证码）')
    return { ok: true, token: auto.body.token, method: 'auto' }
  }
  onLog(`type=auto 不可用: ${summarize(auto)}`)
  if (classifyError(auto) === 'credential') {
    return { ok: false, error: 'credential', detail: summarize(auto) }
  }

  // 2) 图片验证码循环
  let lowConfSkips = 0
  for (let round = 1; round <= maxRounds; round++) {
    const cap = await fetchCaptcha(backend)
    if (cap.error) return { ok: false, error: 'captcha_fetch', detail: cap.error }
    const r = recognizeBase64(cap.imageBase64)
    if (r.error) return { ok: false, error: 'captcha_format', detail: r.error }
    if (r.minConf < MIN_CONF) {
      lowConfSkips++
      onLog(`第 ${round} 轮识别置信度不足 (${r.code}, minConf=${r.minConf})，换码`)
      if (lowConfSkips >= maxRounds) {
        return { ok: false, error: 'captcha_exhausted', detail: `连续 ${lowConfSkips} 张验证码置信度不足，CNN 可能已失效（后端验证码样式变更？需按 captcha-ext README 重训）` }
      }
      continue
    }
    const resp = await postLogin(backend, {
      username,
      password,
      type: 'password',
      captchaId: cap.id,
      captchaCode: r.code,
    })
    if (resp.networkError) return { ok: false, error: 'network', detail: resp.networkError }
    if (resp.ok && resp.body?.token) {
      onLog(`第 ${round} 轮验证码登录成功 (${r.code})`)
      return { ok: true, token: resp.body.token, method: 'captcha', rounds: round, code: r.code, confs: r.confs }
    }
    const kind = classifyError(resp)
    if (kind === 'captcha') {
      onLog(`第 ${round} 轮验证码错误 (${r.code})，重试`)
      continue
    }
    return { ok: false, error: kind, detail: summarize(resp) }
  }
  return { ok: false, error: 'captcha_exhausted', detail: `${maxRounds} 轮验证码均未通过` }
}
