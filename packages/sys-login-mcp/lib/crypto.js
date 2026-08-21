// 密码加密 —— 复刻 wbscf-web packages/wbscf/src/utils/crypto.ts 的 encrypt()
// crypto-js 用 Utf8.parse(key) 即原始字节 key（非 passphrase 派生），
// 因此 node:crypto aes-128-cbc + PKCS#7（默认 padding）可逐字节复现。
import crypto from 'node:crypto'

export function encryptPassword(password, username, requestTime) {
  const key = Buffer.from(username.padStart(16, '0'), 'utf8')
  const iv = Buffer.from(requestTime.padEnd(16, '0'), 'utf8')
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv)
  return Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]).toString('base64')
}
