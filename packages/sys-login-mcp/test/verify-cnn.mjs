// 离线回归：用 captcha-ext-test 的 40 张人工标注样本验证 CNN 移植正确性
// 期望字符级准确率 ≥96%（插件交付基线 96.9%）。只读 captcha-ext-test，不修改。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { loadWeights, predictTTA } from '../lib/captcha-cnn.js'
import { loadWeights as loadWeightsFile } from '../lib/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 外部样本路径可用环境变量覆盖（默认 Windows 路径）
const SAMPLES = process.env.EXT_TEST ? `${process.env.EXT_TEST}/samples` : 'D:/projects/captcha-ext-test/samples'

// 与 captcha-ext-test/prep.js 的 GT 表一致（40 张人工标注）
const GT = {
  '01': 'neir', '02': 'tbxa', '03': 'jobm', '04': 'miue', '05': 'etgj', '06': 'lseo', '07': 'kost', '08': 'nhln',
  '09': 'bkfb', '10': 'kbcr', '11': 'pvwl', '12': 'luyb', '13': 'qlhm', '14': 'wbhz', '15': 'swev', '16': 'jgll',
  '17': 'zhae', '18': 'zjno', '19': 'fkdh', '20': 'fpif', '21': 'xbku', '22': 'sgve', '23': 'cyrq', '24': 'vhbf',
  '25': 'ejxr', '26': 'huxf', '27': 'aukw', '28': 'plkw', '29': 'nsmj', '30': 'vjwx', '31': 'dkpj', '32': 'occx',
  '33': 'fxid', '34': 'tkir', '35': 'uace', '36': 'qqrw', '37': 'yaww', '38': 'fxgm', '39': 'avrx', '40': 'fcgs',
}

const SLOT_CX = [21, 36, 51, 66]
const CROP_W = 34
const CROP_H = 38
const CROP_Y0 = 6

function binarize(data, w, h) {
  const ink = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const r = data[p * 4] / 255
    const g = data[p * 4 + 1] / 255
    const b = data[p * 4 + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    let is
    if (max === min) is = l < 0.5 ? 1 : 0
    else {
      const dd = max - min
      const s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min)
      is = (l < 0.82 && (s > 0.18 || l < 0.5)) ? 1 : 0
    }
    ink[p] = is
  }
  return ink
}

function predictPng(png) {
  const ink = binarize(png.data, png.width, png.height)
  let code = ''
  const confs = []
  for (let k = 0; k < 4; k++) {
    const m = new Float32Array(CROP_W * CROP_H)
    const sx = SLOT_CX[k] - (CROP_W >> 1)
    for (let y = 0; y < CROP_H; y++) for (let x = 0; x < CROP_W; x++) {
      const px = sx + x
      const py = CROP_Y0 + y
      m[y * CROP_W + x] = (px >= 0 && px < png.width && py >= 0 && py < png.height) ? ink[py * png.width + px] : 0
    }
    const p = predictTTA(m)
    let best = 0
    for (let c = 1; c < 26; c++) if (p[c] > p[best]) best = c
    code += String.fromCharCode(97 + best)
    confs.push(p[best])
  }
  return { code, confs }
}

const weights = loadWeightsFile()
if (weights.error) {
  console.error(weights.error)
  process.exit(1)
}
loadWeights(weights.tensors)

let charTotal = 0
let charHit = 0
let imgTotal = 0
let imgHit = 0
const misses = []
for (let i = 1; i <= 40; i++) {
  const id = String(i).padStart(2, '0')
  const file = path.join(SAMPLES, `s${id}.png`)
  if (!fs.existsSync(file)) continue
  const png = PNG.sync.read(fs.readFileSync(file))
  const { code, confs } = predictPng(png)
  const truth = GT[id]
  imgTotal++
  let imgOk = true
  for (let k = 0; k < 4; k++) {
    charTotal++
    if (code[k] === truth[k]) charHit++
    else imgOk = false
  }
  if (imgOk) imgHit++
  else misses.push(`s${id}: 识别=${code} 实际=${truth} confs=[${confs.map((c) => c.toFixed(2)).join(',')}]`)
}

const charAcc = ((charHit / charTotal) * 100).toFixed(1)
const imgAcc = ((imgHit / imgTotal) * 100).toFixed(1)
console.log(`样本: ${imgTotal} 张（${charTotal} 字符）`)
console.log(`字符级准确率: ${charHit}/${charTotal} = ${charAcc}%（基线 96.9%，门槛 96%）`)
console.log(`整图准确率: ${imgHit}/${imgTotal} = ${imgAcc}%（基线 87.5%）`)
if (misses.length) {
  console.log('\n整图未全对的样本:')
  misses.forEach((m) => console.log(`- ${m}`))
}
if (charTotal === 0) {
  console.error('未找到样本，检查 SAMPLES 路径')
  process.exit(1)
}
process.exit(charHit / charTotal >= 0.96 ? 0 : 1)
