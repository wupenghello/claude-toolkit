// 验证码图片识别：data URL PNG → { code, confs }
// 二值化/裁剪逻辑与 captcha-ext/recognizer.js、captcha-ext-test/prep.js 逐行等价（同一 HSL 公式与槽位常量）
import { PNG } from 'pngjs'
import { predictTTA } from './captcha-cnn.js'

// 4 个字母槽位中心（相对 120x40 图），与插件 config.js 一致
const SLOT_CX = [21, 36, 51, 66]
const CROP_W = 34
const CROP_H = 38
const CROP_Y0 = 6

// png.data: RGBA 行主序
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

function cropSlot(ink, w, h, k) {
  const m = new Float32Array(CROP_W * CROP_H)
  const sx = SLOT_CX[k] - (CROP_W >> 1)
  for (let y = 0; y < CROP_H; y++) for (let x = 0; x < CROP_W; x++) {
    const px = sx + x
    const py = CROP_Y0 + y
    m[y * CROP_W + x] = (px >= 0 && px < w && py >= 0 && py < h) ? ink[py * w + px] : 0
  }
  return m
}

// imageBase64: 后端返回的完整 data URL（data:image/png;base64,xxxx）或裸 base64
export function recognizeBase64(imageBase64) {
  const b64 = imageBase64.includes(',')
    ? imageBase64.slice(imageBase64.indexOf(',') + 1)
    : imageBase64
  let png
  try {
    png = PNG.sync.read(Buffer.from(b64, 'base64'))
  } catch {
    return { error: 'PNG 解码失败（后端验证码可能已改格式）' }
  }
  if (png.width !== 120 || png.height !== 40) {
    return { error: `验证码尺寸 ${png.width}x${png.height} 非 120x40，CNN 不支持（可能后端已改版）` }
  }
  const ink = binarize(png.data, png.width, png.height)
  let code = ''
  const confs = []
  for (let k = 0; k < 4; k++) {
    const p = predictTTA(cropSlot(ink, png.width, png.height, k))
    let best = 0
    for (let c = 1; c < 26; c++) if (p[c] > p[best]) best = c
    code += String.fromCharCode(97 + best)
    confs.push(Number(p[best].toFixed(4)))
  }
  return { code, confs, minConf: Math.min(...confs) }
}
