/**
 * 抓取真实禅道页面存为测试 fixture（仅手工运行，不自动化）：
 *   node scripts/capture-fixtures.js
 * fixture 只含业务数据不含凭证；禅道改版后重跑即可更新基线。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZentaoClient } from '../lib/zentao-client.js'
import { loadConfig } from '../lib/config.js'

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const client = new ZentaoClient(loadConfig(pkgDir))
const outDir = path.join(pkgDir, 'test', 'fixtures')
fs.mkdirSync(outDir, { recursive: true })

const targets = [
  ['bug-7551.html', '/bug-view-7551.html'],
  ['task-8841.html', '/task-view-8841.html'],
  ['my-task.html', '/my-task-assignedTo.html'],
  ['my-bug-empty.html', '/my-bug-assignedTo.html'],
]
for (const [name, p] of targets) {
  const html = await client.getHtml(p)
  fs.writeFileSync(path.join(outDir, name), html)
  console.log('captured', name, html.length, 'bytes')
}
