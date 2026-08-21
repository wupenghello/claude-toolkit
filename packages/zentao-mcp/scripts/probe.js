/**
 * 探测/验证脚本（开发用）
 * 用法:
 *   node scripts/probe.js login          # 测试登录
 *   node scripts/probe.js bug 7551       # 解析 bug 详情
 *   node scripts/probe.js task 8841      # 解析任务详情
 *   node scripts/probe.js mywork         # 指派给我的清单
 *   node scripts/probe.js img <url>      # 下载图片并保存
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZentaoClient } from '../lib/zentao-client.js'
import { loadConfig } from '../lib/config.js'
import { parseListRows } from '../lib/zentao-page.js'
import { parseTitleId, parseDetailSections, parseFields, parseHistories, collectMedia } from '../lib/zentao-page.js'

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = loadConfig(pkgDir)
const client = new ZentaoClient(config)

const [cmd, arg] = process.argv.slice(2)

try {
  if (cmd === 'login') {
    console.log('已登录?', await client.isLoggedIn())
  } else if (cmd === 'bug' || cmd === 'task') {
    const html = await client.getHtml(`/${cmd}-view-${arg}.html`)
    const { id, title } = parseTitleId(html)
    console.log(`#${id} ${title}`)
    console.log('--- fields ---')
    console.log(JSON.stringify(parseFields(html), null, 1).slice(0, 1500))
    console.log('--- sections ---')
    for (const s of parseDetailSections(html)) {
      console.log(`[${s.title}]`, s.text.slice(0, 200) || '(空/仅图片)')
    }
    console.log('--- media ---')
    console.log(JSON.stringify(collectMedia(html), null, 1).slice(0, 800))
    console.log('--- histories ---')
    parseHistories(html).slice(0, 8).forEach((h) => console.log('-', h.slice(0, 120)))
  } else if (cmd === 'mywork') {
    for (const [label, p] of [['Bug', '/my-bug-assignedTo.html'], ['任务', '/my-task-assignedTo.html']]) {
      const rows = parseListRows(await client.getHtml(p))
      console.log(`== ${label} (${rows.length}) ==`)
      rows.forEach((r) => console.log(`- #${r.id} [${r.status}] ${r.name} | pri:${r.pri} sev:${r.severity} | ${r.project}`))
    }
  } else if (cmd === 'img') {
    const abs = client.resolveUrl(arg)
    const { buffer, contentType } = await client.fetchBinary(abs)
    const ext = (contentType.match(/image\/(\w+)/)?.[1] || 'png').replace('jpeg', 'jpg')
    const out = path.join(client.tmpDir, `probe-img.${ext}`)
    client.ensureTmpDir()
    fs.writeFileSync(out, buffer)
    console.log(`已保存: ${out} (${buffer.length} bytes, ${contentType})`)
  } else {
    console.log('用法: probe.js login | bug <id> | task <id> | mywork | img <url>')
  }
} catch (e) {
  console.error('错误:', e.message)
  process.exit(1)
}
