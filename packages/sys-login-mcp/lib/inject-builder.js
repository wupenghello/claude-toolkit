// 按 app 生成「AI 可直接 preview_eval 执行的注入代码」
// 依据 wbscf-web 各应用路由守卫的凭据来源（探索结论）：
//   erp/account/buyer/seller → 共享 cookie wbscf-i-userInfo-localhost = {"token":...}
//   ops → localStorage wbscf-ops-0.0.1-dev-core-access + wbscf-ops-userInfo（loginDate 秒级，守卫校验 8h）
import { APPS } from './config.js'

const COOKIE_KEY = 'wbscf-i-userInfo-localhost'
const OPS_ACCESS_KEY = 'wbscf-ops-0.0.1-dev-core-access'
const OPS_USERINFO_KEY = 'wbscf-ops-userInfo'

export function buildInject(app, token) {
  const conf = APPS[app]
  const t = JSON.stringify(token) // 带引号的 JSON 字符串字面量，防转义问题
  let evalCode
  // authStatus 是跨标签登录/登出广播的瞬时标记，残留 logout_* 会导致注入的凭据被忽略，注入前顺手清掉（无害）
  if (conf.inject === 'cookie') {
    evalCode = `localStorage.removeItem('authStatus'); document.cookie = ${JSON.stringify(COOKIE_KEY)} + '=' + encodeURIComponent(JSON.stringify({ token: ${t} })) + '; path=/'; 'injected:cookie'`
  } else {
    evalCode = `localStorage.removeItem('authStatus'); localStorage.setItem(${JSON.stringify(OPS_ACCESS_KEY)}, JSON.stringify({ accessToken: ${t}, refreshToken: null, accessCodes: [] })); localStorage.setItem(${JSON.stringify(OPS_USERINFO_KEY)}, JSON.stringify({ token: ${t}, loginDate: Math.floor(Date.now() / 1000) })); 'injected:localStorage'`
  }
  const reloadCode = 'window.location.reload()'
  return { evalCode, reloadCode }
}
