/** 红线验证：写请求拦截 + 登录/读取不受影响 */
import fs from 'node:fs'
import { ZentaoClient } from '../lib/zentao-client.js'
import { loadConfig } from '../lib/config.js'

const c = new ZentaoClient(loadConfig())

for (const [m, p] of [['POST', '/bug-edit-7551.html'], ['PUT', '/task-view-8841.html'], ['DELETE', '/bug-view-7551.html']]) {
  try {
    await c.fetch(p, { method: m })
    console.log('FAIL: 未被拦截', m, p)
  } catch (e) {
    console.log('OK 拦截:', m, p, '->', e.message)
  }
}

console.log('登录检查:', (await c.isLoggedIn()) ? '已登录' : '未登录')
const html = await c.getHtml('/task-view-8841.html')
console.log('task-view 长度:', html.length)
if (html.length < 1000) console.log('小响应内容:', html)
