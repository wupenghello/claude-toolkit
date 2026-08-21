/** 轻量 HTML → 纯文本/结构化提取（无第三方依赖） */

const ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

export function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&[a-zA-Z]+;/g, (e) => ENTITIES[e] ?? e)
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '')
}

/**
 * HTML 转可读文本。
 * 图片标记为 [图片: URL]，链接标记为 [链接: URL] 文字，列表转 "- "。
 */
export function htmlToText(html) {
  if (!html) return ''
  let s = String(html)
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(
    /<img[^>]*src=['"]([^'"]+)['"][^>]*>/gi,
    (_, src) => `[图片: ${decodeEntities(src)}]`,
  )
  s = s.replace(/<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi, (_, href, txt) => {
    const t = decodeEntities(stripTags(txt)).trim()
    return t ? `[链接: ${decodeEntities(href)}] ${t}` : `[链接: ${decodeEntities(href)}]`
  })
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|table|ul|ol|blockquote)>/gi, '\n')
  s = s.replace(/<li[^>]*>/gi, '- ')
  s = s.replace(/<\/td>\s*<td[^>]*>/gi, ' | ')
  s = s.replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return s
}

/**
 * 提取 HTML 中的图片和链接。
 * 返回 { images: string[], links: { href, text }[] }
 */
export function extractMedia(html) {
  const images = []
  const links = []
  if (!html) return { images, links }
  const s = String(html)
  const seenImg = new Set()
  for (const m of s.matchAll(/<img[^>]*src=['"]([^'"]+)['"]/gi)) {
    const src = decodeEntities(m[1])
    if (!seenImg.has(src)) {
      seenImg.add(src)
      images.push(src)
    }
  }
  for (const m of s.matchAll(/<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(m[1])
    if (/^(javascript:|#|mailto:)/i.test(href)) continue
    links.push({ href, text: decodeEntities(stripTags(m[2])).trim() })
  }
  return { images, links }
}

/** 从文本中识别禅道内部链接（bug-view-N / task-view-N / story-view-N 等） */
export function parseZentaoRefs(text) {
  const refs = []
  if (!text) return refs
  const re = /(bug|task|story|case|build|product|project|release|testcase|feedback|ticket)-(view|browse|edit)-?(\d+)/gi
  for (const m of text.matchAll(re)) {
    refs.push({ type: m[1].toLowerCase(), action: m[2].toLowerCase(), id: Number(m[3]) })
  }
  // 去重
  const seen = new Set()
  return refs.filter((r) => {
    const k = `${r.type}-${r.id}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
