// Apifox 项目配置 + config.json 加载
// config.json 是 gitignore 的本地文件，含真实 token，绝不上传/输出。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.join(__dirname, '..')

// 两个 project 的稳定 key（registry 的 --project 参数、setup/probe/skill 共用）
export const PROJECT_KEYS = ['erp', 'wbzl']

// 占位 token 判定：模板里的指引文案（非真实 token）。setup.js 也复用它，避免正则漂移
export function isPlaceholderToken(t) {
  return !t || /生成|粘贴|替换|your[ _-]?token|access[ _-]?token/i.test(t)
}

// config.json: { token, projects: { erp:{id,name}, wbzl:{id,name} } }
// file 参数供测试注入临时文件，生产调用走默认路径
export function loadConfig(file = path.join(ROOT, 'config.json')) {
  const guide = `请编辑 ${file} 填入真实 token，格式: {"token":"afxp_...","projects":{"erp":{"id":"7718065","name":"ERP 接口聚合"},"wbzl":{"id":"6574890","name":"物泊智链接口聚合"}}}`
  if (!fs.existsSync(file)) {
    return { error: `config.json 不存在。${guide}` }
  }
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    return { error: `config.json 解析失败: ${e.message}。${guide}` }
  }
  return raw
}

// 解析某个 project key，返回 { id, name, token } 或 { error }
// token 是账号级（一个 Apifox 账号一个 token，访问其下所有项目）；project id 在各 projects[key].id 里区分
export function resolveProject(loaded, key) {
  if (loaded.error) return { error: loaded.error }
  const project = (loaded.projects || {})[key]
  if (!project || !project.id) {
    return { error: `config.json 中没有 projects.${key}（可用: ${PROJECT_KEYS.join(', ')}）` }
  }
  if (isPlaceholderToken(loaded.token)) {
    return { error: `token 未填（仍是占位文案）。请编辑 ${path.join(ROOT, 'config.json')} 填入真实 token` }
  }
  return { id: String(project.id), name: project.name || key, token: loaded.token }
}
