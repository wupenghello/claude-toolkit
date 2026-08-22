// 跨平台路径工具：让 toolkit 在 macOS/Linux 上也能直接跑，不再硬编码 Windows 路径
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 解析默认目标项目目录（未显式传 --project 时的兜底），带来源说明（让用户看到路径从哪来）。
// 优先级：
//   1. WBSCF_ROOT 环境变量（CI / 测试用；目录须真实存在——残留的旧值不劫持自动探测）
//   2. 仓库同级的 wbscf-web（如 macOS 上 ~/wbscf/claude-toolkit 与 ~/wbscf/wbscf-web 并列）
//   3. 平台默认：Windows D:/projects/wbscf-web；macOS/Linux ~/projects/wbscf-web
export function resolveDefaultProject(toolkitRoot) {
  const env = process.env.WBSCF_ROOT
  if (env && fs.existsSync(env)) {
    return { dir: env, source: 'WBSCF_ROOT 环境变量' }
  }
  const sibling = path.resolve(toolkitRoot, '..', 'wbscf-web')
  if (fs.existsSync(sibling)) {
    return { dir: sibling, source: '仓库同级目录' }
  }
  return {
    dir:
      process.platform === 'win32'
        ? 'D:/projects/wbscf-web'
        : path.join(os.homedir(), 'projects', 'wbscf-web'),
    source: '平台默认',
  }
}

// 只要路径、不关心来源的调用方（各包的 setup.js）用这个
export function defaultProjectDir(toolkitRoot) {
  return resolveDefaultProject(toolkitRoot).dir
}
