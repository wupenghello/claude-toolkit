import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 统一配置加载：环境变量 > config.json
 * 环境变量键: ZENTAO_BASE_URL / ZENTAO_ACCOUNT / ZENTAO_PASSWORD / MODAO_ACCOUNT / MODAO_PASSWORD
 * 便于无交互场景（CI/临时调试）不落盘凭证。
 */
export function loadConfig(rootDir) {
  const root = rootDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  let file = {}
  try {
    file = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'))
  } catch {
    /* config.json 可选，可全走环境变量 */
  }
  const env = process.env
  return {
    baseUrl: env.ZENTAO_BASE_URL || file.baseUrl || '',
    account: env.ZENTAO_ACCOUNT || file.account || '',
    password: env.ZENTAO_PASSWORD || file.password || '',
    tmpDir: file.tmpDir || '',
    modao: {
      account: env.MODAO_ACCOUNT || file.modao?.account || '',
      password: env.MODAO_PASSWORD || file.modao?.password || '',
    },
  }
}
