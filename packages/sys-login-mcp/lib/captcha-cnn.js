// CNN 前向传播 —— 自 D:\projects\captcha-ext\cnn.js 移植（函数体保持逐行一致）
// 架构: conv3x3x16-relu → pool2 → conv3x3x32-relu → pool2 → conv3x3x48-relu → pool2 → flatten → dense96-relu → dense26-softmax
// 输入: 38x34 二值图（1 通道，Float32Array，行主序 m[y*34+x]，值 0/1），输出: 26 类概率（类别 0..25 = 'a'..'z'）
// 与原版的差异仅两处：atob → Buffer；window 挂载 → ESM 导出。
'use strict'

const IN_H = 38
const IN_W = 34

function b64ToBytes(b64) {
  return Uint8Array.from(Buffer.from(b64, 'base64'))
}

// TF.js conv kernel shape: [kh, kw, inCh, outCh]; dense kernel: [in, out]
function dequant(t) {
  const bytes = b64ToBytes(t.bytes)
  const n = t.shape.reduce((a, b) => a * b, 1)
  if (bytes.length === n) {
    // int8 量化（对称量化: v ≈ (b - 128) / 127 * scale）
    const f = new Float32Array(n)
    for (let i = 0; i < n; i++) f[i] = (bytes[i] - 128) / 127 * t.scale
    return f
  }
  // float32 原始字节
  return new Float32Array(bytes.buffer, 0, n)
}

function conv2d(x, H, W, C, k, b, kh, kw, outC) {
  const padH = (kh - 1) >> 1
  const padW = (kw - 1) >> 1
  const out = new Float32Array(H * W * outC)
  for (let oy = 0; oy < H; oy++) for (let ox = 0; ox < W; ox++) for (let oc = 0; oc < outC; oc++) {
    let s = 0
    for (let ic = 0; ic < C; ic++) for (let dy = 0; dy < kh; dy++) for (let dx = 0; dx < kw; dx++) {
      const iy = oy - padH + dy
      const ix = ox - padW + dx
      if (iy < 0 || iy >= H || ix < 0 || ix >= W) continue
      s += x[(iy * W + ix) * C + ic] * k[((dy * kw + dx) * C + ic) * outC + oc]
    }
    const v = s + b[oc]
    out[(oy * W + ox) * outC + oc] = v > 0 ? v : 0 // relu: max(0, s+b)
  }
  return out
}

function maxpool(x, H, W, C) {
  const OH = H >> 1
  const OW = W >> 1
  const out = new Float32Array(OH * OW * C)
  for (let oy = 0; oy < OH; oy++) for (let ox = 0; ox < OW; ox++) for (let c = 0; c < C; c++) {
    let m = -Infinity
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const v = x[((oy * 2 + dy) * W + ox * 2 + dx) * C + c]
      if (v > m) m = v
    }
    out[(oy * OW + ox) * C + c] = m
  }
  return out
}

function dense(x, k, b, inN, outN) {
  const out = new Float32Array(outN)
  for (let o = 0; o < outN; o++) {
    let s = b[o]
    for (let i = 0; i < inN; i++) s += x[i] * k[i * outN + o]
    out[o] = s
  }
  return out
}

let W1, B1, W2, B2, W3, B3, W4, B4, W5, B5

// tensors: weights.json 的 tensors 数组（10 个 {shape, scale, bytes}）
export function loadWeights(tensors) {
  if (tensors.length !== 10) throw new Error(`权重张量数量异常: ${tensors.length}（期望 10）`)
  const t = tensors.map(dequant)
  W1 = t[0]; B1 = t[1]; W2 = t[2]; B2 = t[3]; W3 = t[4]; B3 = t[5]
  W4 = t[6]; B4 = t[7]; W5 = t[8]; B5 = t[9]
}

function ensureLoaded() {
  if (!W1) throw new Error('权重未加载：先调用 loadWeights()')
}

// 输入 m: Float32Array(38*34) 0/1，返回 26 概率数组
export function predict(m) {
  ensureLoaded()
  let x = m, H = IN_H, W = IN_W, C = 1
  x = conv2d(x, H, W, C, W1, B1, 3, 3, 16); C = 16
  x = maxpool(x, H, W, C); H >>= 1; W >>= 1
  x = conv2d(x, H, W, C, W2, B2, 3, 3, 32); C = 32
  x = maxpool(x, H, W, C); H >>= 1; W >>= 1
  x = conv2d(x, H, W, C, W3, B3, 3, 3, 48); C = 48
  x = maxpool(x, H, W, C); H >>= 1; W >>= 1
  // flatten (H*W*C = 4*4*48 = 768, 行主序 [y][x][c] 与 tf.js flatten 一致)
  const flat = x
  let d = dense(flat, W4, B4, flat.length, 96)
  for (let i = 0; i < 96; i++) if (d[i] < 0) d[i] = 0
  const logits = dense(d, W5, B5, 96, 26)
  const mx = Math.max(...logits)
  let sum = 0
  const p = new Float32Array(26)
  for (let i = 0; i < 26; i++) { p[i] = Math.exp(logits[i] - mx); sum += p[i] }
  for (let i = 0; i < 26; i++) p[i] /= sum
  return p
}

// 对单个槽位裁剪做 TTA（5 个偏移平均），m 为 38x34 Float32Array
function shiftCrop(m, dx, dy) {
  const o = new Float32Array(IN_H * IN_W)
  for (let y = 0; y < IN_H; y++) for (let x = 0; x < IN_W; x++) {
    const sx = x - dx
    const sy = y - dy
    o[y * IN_W + x] = sx >= 0 && sx < IN_W && sy >= 0 && sy < IN_H ? m[sy * IN_W + sx] : 0
  }
  return o
}

export function predictTTA(m) {
  const SH = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
  let acc = null
  for (const [dx, dy] of SH) {
    const p = predict(shiftCrop(m, dx, dy))
    if (!acc) { acc = Array.from(p) }
    else for (let i = 0; i < 26; i++) acc[i] += p[i]
  }
  let s = 0
  for (let i = 0; i < 26; i++) s += acc[i]
  for (let i = 0; i < 26; i++) acc[i] /= s
  return acc
}

export const IN_H_ = IN_H
export const IN_W_ = IN_W
