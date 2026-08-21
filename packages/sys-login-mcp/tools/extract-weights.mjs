#!/usr/bin/env node
// 一次性转换：D:\projects\captcha-ext\weights.js（window.__CAP_WEIGHTS = {...}）
//           → 本项目 weights.json
// 插件重训并重新导出 weights.js 后，重跑本脚本即可更新权重。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = 'D:/projects/captcha-ext/weights.js'
const DEST = path.join(__dirname, '..', 'weights.json')

const raw = fs.readFileSync(SRC, 'utf8')
// 定位赋值号：从 "__CAP_WEIGHTS" 标识符之后找第一个 '='（不能全局找 '='，base64 padding 也含 '='）
const marker = raw.indexOf('__CAP_WEIGHTS')
if (marker < 0) throw new Error('weights.js 格式不符：找不到 __CAP_WEIGHTS')
const eq = raw.indexOf('=', marker)
if (eq < 0) throw new Error('weights.js 格式不符：找不到赋值号')
let json = raw.slice(eq + 1).trim()
// 去掉行尾可能的分号
if (json.endsWith(';')) json = json.slice(0, -1)
const weights = JSON.parse(json)
if (!Array.isArray(weights.tensors) || weights.tensors.length !== 10) {
  throw new Error(`权重张量数量异常：${weights.tensors?.length}（期望 10）`)
}
fs.writeFileSync(DEST, JSON.stringify(weights))
const total = weights.tensors.reduce((a, t) => a + t.shape.reduce((x, y) => x * y, 1), 0)
console.log(`weights.json 已生成：10 个张量，共 ${total} 个参数`)
