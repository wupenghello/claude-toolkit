// 对拍验证：node:crypto 实现 vs 前端 crypto-js 实现（复用 wbscf-web 的 node_modules，只读）
// 依赖路径可用环境变量 WBSCF_ROOT 覆盖（默认 Windows 路径）
import { createRequire } from 'node:module'
import { encryptPassword } from '../lib/crypto.js'

const require = createRequire(`${process.env.WBSCF_ROOT ?? 'D:/projects/wbscf-web'}/package.json`)
const CryptoJS = require('crypto-js')

// 与 packages/wbscf/src/utils/crypto.ts encrypt() 完全一致
function frontendEncrypt(text, key, iv) {
  key = key.padStart(16, '0')
  iv = iv.padEnd(16, '0')
  const srcs = CryptoJS.enc.Utf8.parse(text)
  const encrypted = CryptoJS.AES.encrypt(srcs, CryptoJS.enc.Utf8.parse(key), {
    iv: CryptoJS.enc.Utf8.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  return CryptoJS.enc.Base64.stringify(encrypted.ciphertext)
}

const cases = [
  ['Passw0rd!123', '13800001111', '1735000000000'],
  ['a', '13800001111', '1735000000001'], // 短明文（padding 路径）
  ['中文密码测试一二三', '13999998888', '1735999999999'], // 多字节 UTF-8
  ['x'.repeat(31), '13712345678', '1735111111111'], // 跨 padding 块（31 字节 → 2 块）
  ['exactly16bytes..', '13666667777', '1735222222222'], // 恰好 16 字节 → 补整块
]

let fail = 0
for (const [text, user, time] of cases) {
  const a = frontendEncrypt(text, user, time)
  const b = encryptPassword(text, user, time)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} user=${user} time=${time} crypto-js=${a.slice(0, 24)}... node=${b.slice(0, 24)}...`)
}
console.log(fail === 0 ? '\n全部一致：node:crypto 复刻正确' : `\n${fail} 个用例不一致！`)
process.exit(fail === 0 ? 0 : 1)
