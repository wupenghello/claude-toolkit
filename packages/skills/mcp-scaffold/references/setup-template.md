# 模板：scripts/setup.js（一键安装，六要素缺一不可）

六要素：**幂等 / 项目路径校验 / 凭据交互录入 / MCP 注册 / skill 部署 / 下一步清单**。

```js
#!/usr/bin/env node
// 一键安装/更新 {{name}}-mcp。幂等，可重复执行。
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const argProject = process.argv.find((a) => a.startsWith('--project='))
const PROJECT = argProject ? argProject.slice('--project='.length) : 'D:/projects/<默认项目>'
const log = (m) => console.log(`[setup] ${m}`)

// —— 凭据文件是否仍是模板/无效 ——
function needsSetup(file) {
  if (!fs.existsSync(file)) return true
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    // 按业务判定"有效"，占位值必须识别出来（如 username === '手机号'）
    return !raw.accounts?.some((a) => a.username && a.username !== '手机号')
  } catch {
    return true
  }
}

// —— 交互式录入（非 TTY 自动跳过并打印指引）——
async function prompt(file) {
  if (!process.stdin.isTTY) {
    log('当前非交互环境，跳过录入。请稍后手动编辑（见"下一步"）')
    return false
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const go = (await rl.question('\n检测到还没有有效配置，现在填入吗？(Y/n) ')).trim().toLowerCase()
    if (go && go !== 'y' && go !== 'yes') return false
    // 逐项 question，空必填项则放弃写入并提示手动编辑
    // fs.writeFileSync(file, JSON.stringify(config, null, 2))
    return true
  } finally {
    rl.close()
  }
}

async function main() {
  // 0. 项目目录校验：不存在（如 macOS 用了 Windows 默认路径）必须报错退出，
  //    否则会在错误位置注册 MCP / 创建垃圾目录
  if (!fs.existsSync(PROJECT)) {
    console.error(`[setup] 项目目录不存在: ${PROJECT}`)
    console.error('        请用 --project=<你的项目路径> 指定，例如: node scripts/setup.js --project=/Users/xxx/code/xxx')
    process.exit(1)
  }

  // 1. 依赖
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    log('安装依赖...')
    execSync('npm install --no-fund --no-audit', { cwd: ROOT, stdio: 'inherit' })
  } else {
    log('依赖已安装，跳过')
  }

  // 2. 本地凭据/配置文件（gitignore 的那个）：无效→模板+交互录入
  // 3. `claude mcp add --scope project {{name}} node "<ROOT>/index.js"`（cwd: PROJECT）
  //    先读 PROJECT/.mcp.json 判断已注册则跳过；execSync 失败时打印手动配置完整说明
  // 4. skill 部署：copyFileSync(ROOT/skill/{{name}}/SKILL.md → PROJECT/.claude/skills/{{name}}/SKILL.md)，覆盖即更新

  console.log('\n================ 下一步 ================')
  // 按"未完成项置顶醒目"的原则编号列出：填配置(如未完成)/重启会话/probe 验证/使用方式示例
  console.log('========================================')
}

main().catch((e) => { console.error('[setup] 失败:', e.message); process.exit(1) })
```

## 容易漏的细节

- **交互问题要给默认值**（回车即用），必填项为空则放弃写入（不能写半截配置）
- `claude mcp add` 的 args 必须用 `path.join(ROOT, 'index.js')` 生成的**绝对路径**（克隆位置任意）
- readline 用 `node:readline/promises`（Node 18+）
- 结尾"下一步"清单中，未完成的事项（如凭据没填）必须放第 1 条并加醒目标记
- setup 里所有步骤失败都**给出手动替代方案**，不允许"失败了就死"
