import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  parseTitleId,
  parseDetailSections,
  parseFields,
  parseHistories,
  parseListRows,
  collectMedia,
} from '../lib/zentao-page.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const read = (n) => fs.readFileSync(path.join(dir, n), 'utf8')
const bug = read('bug-7551.html')
const task = read('task-8841.html')

describe('parseTitleId', () => {
  it('bug 页取到 id 与标题', () => {
    const { id, title } = parseTitleId(bug)
    expect(id).toBe(7551)
    expect(title).toContain('卖家规格导入失败')
  })
  it('空 HTML 返回兜底值', () => {
    expect(parseTitleId('')).toEqual({ id: null, title: '' })
  })
})

describe('parseFields', () => {
  it('bug 关键字段齐全', () => {
    const f = parseFields(bug)
    expect(f['解决方案']).toBe('无法重现')
    expect(f['Bug状态']).toBe('已关闭')
    expect(f['所属产品']).toContain('物泊智链')
  })
  it('跳过 0000-00-00 脏值', () => {
    const f = parseFields(bug)
    expect(Object.values(f).some((v) => v.includes('0000-00-00'))).toBe(false)
  })
})

describe('parseDetailSections', () => {
  it('bug 页含重现步骤与归一化历史记录', () => {
    const titles = parseDetailSections(bug).map((s) => s.title)
    expect(titles).toContain('重现步骤')
    expect(titles).toContain('历史记录')
  })
  it('task 页含任务描述/需求描述/验收标准', () => {
    const titles = parseDetailSections(task).map((s) => s.title)
    expect(titles).toEqual(expect.arrayContaining(['任务描述', '需求描述', '验收标准']))
  })
})

describe('parseHistories', () => {
  it('bug 7551 三条主事件且不含字段变更明细', () => {
    const h = parseHistories(bug)
    expect(h).toHaveLength(3)
    expect(h.join('\n')).toContain('创建')
    expect(h.join('\n')).not.toContain('修改了')
  })
})

describe('parseListRows', () => {
  it('我的任务列表解析 8841 行', () => {
    const rows = parseListRows(read('my-task.html'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      type: 'task',
      id: 8841,
      name: '【前端】运营后台-新增-提货单',
      status: '进行中',
      pri: '3',
      project: '电商-运营后台权限-SCF0050',
    })
  })
  it('空 bug 列表返回 []', () => {
    expect(parseListRows(read('my-bug-empty.html'))).toEqual([])
  })
  it('空 HTML 返回 []', () => {
    expect(parseListRows('')).toEqual([])
  })
})

describe('collectMedia', () => {
  it('bug 截图入清单且不含历史记录图片', () => {
    const { images } = collectMedia(bug)
    expect(images).toContain('/zentao/file-read-15523.png')
  })
})

describe('边界页面降级', () => {
  const loginRedirect = `<html><script>self.location='/zentao/user-login-xxx.html';</script></html>`
  const deny = `<html><script>self.location='/zentao/user-deny-my-work.html';</script></html>`
  it('登录跳转/无权限页不误报', () => {
    expect(parseTitleId(loginRedirect).id).toBeNull()
    expect(parseListRows(deny)).toEqual([])
    expect(parseFields(loginRedirect)).toEqual({})
    expect(parseHistories(deny)).toEqual([])
  })
})
