// 应用配置表 + 账号文件加载
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.join(__dirname, '..')

// dev 环境各应用：后端网关、dev 页面地址、launch.json 里的启动名、注入方式
export const APPS = {
  erp: {
    backend: 'https://erp-dev.wbscf.tech',
    devUrl: 'http://localhost:5668/console/',
    launch: 'erp-dev',
    inject: 'cookie',
    notes: ['多公司账号登录后可能弹公司选择框，尽量用单公司测试账号'],
  },
  ops: {
    backend: 'http://ops-dev.wbscf.tech',
    devUrl: 'http://localhost:5660/',
    launch: 'ops-dev',
    inject: 'localStorage',
    notes: [],
  },
  account: {
    backend: 'http://i-dev.wbscf.tech',
    devUrl: 'http://localhost:5661/account/',
    launch: 'account-dev',
    inject: 'cookie',
    notes: ['account 登录成功后页面可能自动跳商城首页，属正常现象'],
  },
  buyer: {
    backend: 'http://i-dev.wbscf.tech',
    devUrl: 'http://localhost:5662/buyer/',
    launch: 'buyer-dev',
    inject: 'cookie',
    notes: ['buyer 无独立登录页，依赖共享 cookie；账号必须已有 currentCompanyId，否则被踢到认证页'],
  },
  seller: {
    backend: 'http://i-dev.wbscf.tech',
    devUrl: 'http://localhost:5663/seller/',
    launch: 'seller-dev',
    inject: 'cookie',
    notes: ['seller 无独立登录页，依赖共享 cookie；账号必须已有 currentCompanyId，否则被踢到认证页'],
  },
}

export const APP_NAMES = Object.keys(APPS)

export function weightsFile() {
  return path.join(ROOT, 'weights.json')
}

export function loadWeights() {
  const file = weightsFile()
  if (!fs.existsSync(file)) return { error: 'weights.json 缺失（仓库应自带该文件，请检查仓库完整性）' }
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const PLACEHOLDER_VALUES = new Set(['手机号', '密码', 'your-phone', 'your-password'])

// accounts.json: { "default": "dev1", "accounts": [{ "alias": "dev1", "username": "138...", "password": "...", "note": "..." }] }
// file 参数供测试注入临时文件，生产调用走默认路径
export function loadAccounts(file = path.join(ROOT, 'accounts.json')) {
  const guide = `请编辑 ${file} 填入真实测试账号，格式: {"default":"dev1","accounts":[{"alias":"dev1","username":"手机号","password":"密码","note":"备注"}]}`
  if (!fs.existsSync(file)) {
    return { error: `accounts.json 不存在。${guide}`, default: null, accounts: [] }
  }
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    return { error: `accounts.json 解析失败: ${e.message}。${guide}`, default: null, accounts: [] }
  }
  const accounts = Array.isArray(raw.accounts) ? raw.accounts : []
  if (!accounts.length) {
    return { error: `accounts.json 中没有账号。${guide}`, default: null, accounts: [] }
  }
  for (const a of accounts) {
    if (!a.alias || !a.username || !a.password) {
      return { error: `账号条目缺 alias/username/password 字段: ${JSON.stringify({ ...a, password: undefined })}。${guide}`, default: null, accounts: [] }
    }
    if (PLACEHOLDER_VALUES.has(a.username) || PLACEHOLDER_VALUES.has(a.password)) {
      return { error: `accounts.json 还是占位模板（账号 "${a.alias}" 未填真实手机号/密码）。${guide}`, default: null, accounts: [] }
    }
  }
  return { default: raw.default ?? null, accounts }
}

export function findAccount(loaded, alias) {
  if (loaded.error) return { error: loaded.error }
  const list = loaded.accounts
  if (!list.length) return { error: 'accounts.json 中没有账号' }
  const hit = alias
    ? list.find((a) => a.alias === alias)
    : list.find((a) => a.alias === loaded.default) ?? list[0]
  if (!hit) return { error: `找不到账号别名 "${alias}"，可用: ${list.map((a) => a.alias).join(', ')}` }
  return { account: hit }
}
