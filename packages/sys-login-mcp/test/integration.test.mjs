// 集成测试：依赖外部项目（wbscf-web 的 crypto-js、captcha-ext-test 的标注样本），
// 不存在时自动跳过（describe.skipIf），保证 vitest 在任何机器可独立跑通单元部分。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'

import { loadWeights, predictTTA } from '../lib/captcha-cnn.js'
import { encryptPassword } from '../lib/crypto.js'
import { loadWeights as loadWeightsFile } from '../lib/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 外部项目路径可用环境变量覆盖（Windows 默认路径不适用于 macOS/Linux）
const WBSCF_ROOT = process.env.WBSCF_ROOT ?? 'D:/projects/wbscf-web'
const EXT_TEST = process.env.EXT_TEST ?? 'D:/projects/captcha-ext-test'

const hasCryptoJs = fs.existsSync(path.join(WBSCF_ROOT, 'node_modules', 'crypto-js'))
const hasSamples = fs.existsSync(path.join(EXT_TEST, 'samples', 's01.png'))

describe.skipIf(!hasCryptoJs)('AES 与前端 crypto-js 对拍（依赖 wbscf-web node_modules）', () => {
  it('多组用例逐字节一致', () => {
    const require = createRequire(path.join(WBSCF_ROOT, 'package.json'))
    const CryptoJS = require('crypto-js')
    const frontendEncrypt = (text, key, iv) => {
      key = key.padStart(16, '0')
      iv = iv.padEnd(16, '0')
      const srcs = CryptoJS.enc.Utf8.parse(text)
      const encrypted = CryptoJS.AES.encrypt(srcs, CryptoJS.enc.Utf8.parse(key), {
        iv: CryptoJS.enc.Utf8.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      })
      return CryptoJS.enc.Base64.stringify(encrypted.ciphertext)
    }
    const cases = [
      ['Passw0rd!123', '13800001111', '1735000000000'],
      ['中文密码测试一二三', '13999998888', '1735999999999'],
      ['x'.repeat(31), '13712345678', '1735111111111'],
    ]
    for (const [text, user, time] of cases) {
      expect(encryptPassword(text, user, time)).toBe(frontendEncrypt(text, user, time))
    }
  })
})

describe.skipIf(!hasSamples)('CNN 移植回归（依赖 captcha-ext-test 标注样本，字符级 ≥96%；权重为仓库内置）', () => {
  const GT = {
    '01': 'neir', '02': 'tbxa', '03': 'jobm', '04': 'miue', '05': 'etgj', '06': 'lseo', '07': 'kost', '08': 'nhln',
    '09': 'bkfb', '10': 'kbcr', '11': 'pvwl', '12': 'luyb', '13': 'qlhm', '14': 'wbhz', '15': 'swev', '16': 'jgll',
    '17': 'zhae', '18': 'zjno', '19': 'fkdh', '20': 'fpif', '21': 'xbku', '22': 'sgve', '23': 'cyrq', '24': 'vhbf',
    '25': 'ejxr', '26': 'huxf', '27': 'aukw', '28': 'plkw', '29': 'nsmj', '30': 'vjwx', '31': 'dkpj', '32': 'occx',
    '33': 'fxid', '34': 'tkir', '35': 'uace', '36': 'qqrw', '37': 'yaww', '38': 'fxgm', '39': 'avrx', '40': 'fcgs',
  }
  const SLOT_CX = [21, 36, 51, 66]
  const CROP_W = 34, CROP_H = 38, CROP_Y0 = 6

  it('40 张人工标注样本', { timeout: 60000 }, () => {
    loadWeights(loadWeightsFile().tensors)
    let total = 0
    let hit = 0
    for (let i = 1; i <= 40; i++) {
      const id = String(i).padStart(2, '0')
      const file = path.join(EXT_TEST, 'samples', `s${id}.png`)
      if (!fs.existsSync(file)) continue
      const png = PNG.sync.read(fs.readFileSync(file))
      const truth = GT[id]
      for (let k = 0; k < 4; k++) {
        const m = new Float32Array(CROP_W * CROP_H)
        const sx = SLOT_CX[k] - (CROP_W >> 1)
        for (let y = 0; y < CROP_H; y++) for (let x = 0; x < CROP_W; x++) {
          const px = sx + x, py = CROP_Y0 + y
          m[y * CROP_W + x] = pngAt(png, px, py)
        }
        const p = predictTTA(m)
        let best = 0
        for (let c = 1; c < 26; c++) if (p[c] > p[best]) best = c
        total++
        if (String.fromCharCode(97 + best) === truth[k]) hit++
      }
    }
    expect(total).toBe(160)
    expect(hit / total).toBeGreaterThanOrEqual(0.96)
  })
})

// HSL 二值化 + 槽位取样（与 lib/captcha-image.js 相同公式）
function pngAt(png, px, py) {
  if (px < 0 || px >= png.width || py < 0 || py >= png.height) return 0
  const p = py * png.width + px
  const r = png.data[p * 4] / 255, g = png.data[p * 4 + 1] / 255, b = png.data[p * 4 + 2] / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return l < 0.5 ? 1 : 0
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  return (l < 0.82 && (s > 0.18 || l < 0.5)) ? 1 : 0
}
