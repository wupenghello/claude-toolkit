/** 禅道 12.5.3 页面 HTML 解析（无第三方依赖，正则 + div 深度计数） */
import { htmlToText, extractMedia } from './html.js'

/** 从 startIdx 处的 <div...> 开始，按深度计数截取到匹配的 </div> */
function sliceDivBlock(html, startIdx) {
  let depth = 0
  let started = false
  const re = /<div\b[^>]*>|<\/div>/gi
  re.lastIndex = startIdx
  let m
  while ((m = re.exec(html))) {
    if (m[0].startsWith('</')) {
      depth--
      if (started && depth === 0) return html.slice(startIdx, m.index + m[0].length)
    } else {
      depth++
      started = true
    }
    if (re.lastIndex >= html.length) break
  }
  return html.slice(startIdx, startIdx + 5000)
}

/** 解析页面标题区：{ id, title } */
export function parseTitleId(html) {
  const id = html.match(/class=["']label label-id["']>\s*(\d+)/)?.[1]
  let title =
    html.match(/<span class=["']text["']\s+title=["']([^"']*)["']/)?.[1] ||
    html.match(/<span class=["']text["'][^>]*>([\s\S]*?)<\/span>/)?.[1] ||
    ''
  title = htmlToText(title).trim()
  return { id: id ? Number(id) : null, title }
}

/**
 * 解析所有 detail 区块（重现步骤/任务描述/需求描述/验收标准/历史记录等）
 * 返回 [{ title, html, text }]，html 为 detail-content 内容
 */
export function parseDetailSections(html) {
  const sections = []
  const titleRe = /<div class=["']detail-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi
  let m
  while ((m = titleRe.exec(html))) {
    const title = htmlToText(m[1]).replace(/历史记录.*/, '历史记录').trim()
    const after = html.indexOf('detail-content', m.index + m[0].length)
    if (after === -1 || after - m.index > 3000) continue
    const divStart = html.lastIndexOf('<div', after)
    const block = sliceDivBlock(html, divStart)
    // 去掉最外层 div 包裹
    const inner = block
      .replace(/^<div[^>]*>/, '')
      .replace(/<\/div>\s*$/, '')
    sections.push({ title, html: inner, text: htmlToText(inner) })
  }
  return sections
}

/** 解析字段表格（基本信息/Bug的一生等 tab 里的 th/td 对） */
export function parseFields(html) {
  const fields = {}
  const rowRe = /<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi
  let m
  while ((m = rowRe.exec(html))) {
    const key = htmlToText(m[1]).trim()
    const value = htmlToText(m[2]).trim()
    if (key && value && value !== '0000-00-00') fields[key] = value
  }
  return fields
}

/** 解析历史记录/评论（ol.histories-list），保留主事件行，去掉冗长字段变更 */
export function parseHistories(html) {
  const ol = html.match(/<ol class=['"]histories-list['"]>([\s\S]*?)<\/ol>/i)
  if (!ol) return []
  const entries = []
  const liRe = /<li\s+value=['"]?\d+['"]?[^>]*>([\s\S]*?)<\/li>/gi
  let m
  while ((m = liRe.exec(ol[1]))) {
    let content = m[1]
    // 去掉按钮和字段变更详情
    content = content.replace(/<button[\s\S]*?<\/button>/gi, '')
    content = content.replace(/<div class=['"]history-changes['"][\s\S]*?<\/div>/gi, '')
    const text = htmlToText(content).trim()
    if (text) entries.push(text)
  }
  return entries
}

/**
 * 解析列表页行（任务/Bug 列表），识别 c-* 单元格
 * 返回 [{ type, id, name, status, pri, severity, assignedTo, project, createdBy }]
 */
export function parseListRows(html) {
  const rows = []
  // 按 <tr 切段
  const trs = html.split(/<tr[\s>]/).slice(1)
  for (const tr of trs) {
    const link = tr.match(/(bug|task)-view-(\d+)\.html/)
    if (!link) continue
    const type = link[1]
    const id = Number(link[2])
    // 同时捕获 td 的属性和内容
    const cell = (cls) => {
      const m = tr.match(new RegExp(`<td class=['"]${cls}[^'"]*['"]([^>]*)>([\\s\\S]*?)(?=<td|<\\/tr>)`))
      return m ? { attrs: m[1], body: m[2] } : { attrs: '', body: '' }
    }
    const plainText = (h) => htmlToText(h.replace(/<a\b[^>]*>/gi, '').replace(/<\/a>/gi, '')).trim()
    const attrTitle = (attrs) => attrs.match(/title=['"]([^'"]+)['"]/)?.[1]?.trim() || ''

    const nameCell = cell('c-name')
    const name = attrTitle(nameCell.attrs) || plainText(nameCell.body)
    const projectCell = cell('c-project')
    const project = attrTitle(projectCell.attrs) || plainText(projectCell.body)
    const status = plainText(cell('c-status').body)
    const priCell = cell('c-pri')
    const pri = attrTitle(priCell.attrs) || plainText(priCell.body)
    const severity = cell('c-severity').body.match(/data-severity=['"](\d)['"]/)?.[1] || ''
    const assignedTo = plainText(cell('c-assignedTo').body)
    const createdBy = plainText(cell('c-user').body)
    rows.push({ type, id, name, status, pri, severity, assignedTo, project, createdBy })
  }
  return rows
}

/** 汇总一个详情页的全部媒体（图片/链接），跨所有 detail 区块 */
export function collectMedia(html) {
  const sections = parseDetailSections(html)
  const images = []
  const links = []
  const seen = new Set()
  for (const s of sections) {
    if (s.title === '历史记录') continue
    const { images: imgs, links: ls } = extractMedia(s.html)
    for (const i of imgs) if (!seen.has(i)) (seen.add(i), images.push(i))
    for (const l of ls) if (!seen.has(l.href)) (seen.add(l.href), links.push(l))
  }
  return { images, links }
}
