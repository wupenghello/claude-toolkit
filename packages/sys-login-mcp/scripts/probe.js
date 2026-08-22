#!/usr/bin/env node
// CLI 探测：不启动 Claude，直接在命令行验证登录链路 / 验证码识别 / 后端连通
// 用法:
//   node scripts/probe.js --app=erp [--account=dev1]   完整登录
//   node scripts/probe.js --captcha=erp                只拉一张验证码识别
//   node scripts/probe.js --reach                      只测各后端连通
import { loadAccounts, findAccount, APPS, loadWeights } from '../lib/config.js'
import { loadWeights as cnnLoadWeights } from '../lib/captcha-cnn.js'
import { login } from '../lib/login-core.js'
import { recognizeBase64 } from '../lib/captcha-image.js'

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(hit.indexOf('=') + 1) : undefined
}

async function main() {
  const reachOnly = process.argv.includes('--reach')
  const captchaApp = arg('captcha')

  if (reachOnly) {
    for (const [name, conf] of Object.entries(APPS)) {
      try {
        const res = await fetch(`${conf.backend}/api/captcha/web/image-captcha?width=120&height=40&length=4`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        })
        console.log(`${name}: ${conf.backend} → HTTP ${res.status}`)
      } catch (e) {
        console.log(`${name}: ${conf.backend} → 不通 (${e.message})`)
      }
    }
    return
  }

  if (captchaApp) {
    const conf = APPS[captchaApp]
    if (!conf) throw new Error(`未知应用 ${captchaApp}（可选: ${Object.keys(APPS).join('/')}）`)
    const w = loadWeights()
    cnnLoadWeights(w.tensors)
    const res = await fetch(`${conf.backend}/api/captcha/web/image-captcha?width=120&height=40&length=4`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    const body = await res.json()
    const r = recognizeBase64(body.imageBase64)
    console.log(`后端: ${conf.backend}\n识别: ${r.code} confs=[${(r.confs || []).map((c) => c.toFixed(2)).join(',')}] ${r.minConf >= 0.75 ? '(可提交)' : '(置信度不足)'}`)
    return
  }

  const app = arg('app') ?? 'erp'
  const conf = APPS[app]
  if (!conf) throw new Error(`未知应用 ${app}（可选: ${Object.keys(APPS).join('/')}）`)
  const found = findAccount(loadAccounts(), arg('account'))
  if (found.error) throw new Error(found.error)
  console.log(`应用: ${app} → ${conf.backend}，账号: ${found.account.alias}`)
  const result = await login(
    { backend: conf.backend, username: found.account.username, password: found.account.password },
    { onLog: (m) => console.log(`  [${app}] ${m}`) },
  )
  if (result.ok) {
    console.log(`登录成功: method=${result.method} token=${result.token.slice(0, 8)}...`)
  } else {
    console.error(`登录失败: error=${result.error} detail=${result.detail}`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error('probe 失败:', e.message)
  process.exit(1)
})
