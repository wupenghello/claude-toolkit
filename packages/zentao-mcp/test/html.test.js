import { describe, expect, it } from 'vitest'
import { htmlToText, extractMedia, parseZentaoRefs } from '../lib/html.js'

describe('htmlToText', () => {
  it('图片/链接转标记、br 转换行', () => {
    const t = htmlToText('<p>[步骤]</p><img src="/zentao/file-read-1.png"><br /><a href="bug-view-7.html">关联</a>')
    expect(t).toContain('[图片: /zentao/file-read-1.png]')
    expect(t).toContain('[链接: bug-view-7.html] 关联')
    expect(t).toContain('\n')
  })
  it('解码实体并剥离样式脚本', () => {
    const t = htmlToText('<style>x{}</style><script>alert(1)</script>a&nbsp;b &amp; &#60;c&#62;')
    expect(t).toBe('a b & <c>')
  })
})

describe('extractMedia', () => {
  it('去重并过滤 javascript:/mailto:', () => {
    const { images, links } = extractMedia(
      '<img src="a.png"><img src="a.png"><a href="javascript:x">j</a><a href="mailto:x@y">m</a><a href="/x.html">x</a>',
    )
    expect(images).toEqual(['a.png'])
    expect(links).toEqual([{ href: '/x.html', text: 'x' }])
  })
})

describe('parseZentaoRefs', () => {
  it('识别 bug/task 引用并去重', () => {
    const refs = parseZentaoRefs('http://x/zentao/bug-view-7551.html 和 bug-view-7551 与 task-view-3')
    expect(refs).toEqual([
      { type: 'bug', action: 'view', id: 7551 },
      { type: 'task', action: 'view', id: 3 },
    ])
  })
})
