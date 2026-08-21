# 模板：index.js / package.json / probe.js

占位符：`{{name}}`（如 sys-login）、`{{PREFIX}}`（工具名前缀，如 sys）、`{{desc}}`。业务模块在 `lib/` 按职责拆分，index.js 只做注册。

## index.js

```js
#!/usr/bin/env node
/**
 * {{name}}-mcp — {{desc}}
 * 工具: {{PREFIX}}_status / ...（列出全部）
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
// import 业务模块 from './lib/xxx.js'

const server = new McpServer({ name: '{{name}}', version: '1.0.0' })

const text = (s) => ({ content: [{ type: 'text', text: s }] })
const errText = (e) => ({ isError: true, content: [{ type: 'text', text: `{{name}} 失败: ${e.message ?? e}` }] })
const jsonText = (obj) => text(JSON.stringify(obj, null, 2))

// 敏感字段打码示例（手机号/账号类返回前必须过一道）
function mask(v) {
  const s = String(v)
  return s.length >= 7 ? `${s.slice(0, 3)}****${s.slice(-4)}` : '***'
}

server.registerTool(
  '{{PREFIX}}_status',
  {
    title: '{{name}} 状态检查',
    description: '检查 {{name}} MCP 的配置状态（凭据加载、外部服务连通性）。使用前可先调用确认。',
    inputSchema: {},
  },
  async () => {
    try {
      // 检查配置/连通性，输出多行文本
      return text(['配置: ...', '连通: ...'].join('\n'))
    } catch (e) {
      return errText(e)
    }
  },
)

server.registerTool(
  '{{PREFIX}}_do_thing',
  {
    title: '...',
    description: '一句话说清这个工具做什么、什么时候该用它（AI 靠这个选工具）。',
    inputSchema: {
      app: z.enum(['a', 'b']).describe('参数含义'),
      opt: z.string().optional().describe('可选参数'),
    },
  },
  async ({ app, opt }) => {
    try {
      // 核心逻辑放 lib/，这里只编排
      // 成功：结构化 JSON，字段名即语义，AI 直接取用
      return jsonText({ ok: true, /* ... */ })
      // 失败：error 分类 + detail + 自带指引的 hint（文件路径+格式示例）
    } catch (e) {
      return errText(e)
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('{{name}}-mcp 已启动（工具: ...）') // 只用 stderr 打日志，stdout 是协议通道
}

main().catch((e) => {
  console.error('{{name}}-mcp 启动失败:', e.message)
  process.exit(1)
})
```

要点：
- **console.error 输出日志**，绝不能 console.log（stdout 是 JSON-RPC 通道，混入即协议崩溃）
- 每个工具整体 try/catch，抛错永远返回 errText 而不是让 server 崩
- inputSchema 用 zod，枚举用 `z.enum([...])` 限制取值

## package.json

```json
{
  "name": "{{name}}-mcp",
  "version": "1.0.0",
  "description": "{{desc}}",
  "license": "MIT",
  "private": true,
  "type": "module",
  "engines": { "node": ">=18.14" },
  "bin": {
    "{{name}}-mcp": "./index.js",
    "{{name}}-setup": "./scripts/setup.js",
    "{{name}}-probe": "./scripts/probe.js"
  },
  "scripts": {
    "setup": "node scripts/setup.js",
    "probe": "node scripts/probe.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "vitest": "^4.1.11"
  }
}
```

## scripts/probe.js

CLI 直测核心链路（用户改配置/换机器后的第一验证手段，不启动 Claude）：

```js
#!/usr/bin/env node
// 用法: node scripts/probe.js [--app=x] [--quick] [--reach]
import { ... } from '../lib/xxx.js'

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(hit.indexOf('=') + 1) : undefined
}

async function main() {
  // 按参数分派：--reach 只测连通 / --quick 只测只读操作 / 默认完整链路
  // 每步打日志，失败 process.exitCode = 1 并输出带指引的错误（复用 lib 里的错误信息）
}

main().catch((e) => {
  console.error('probe 失败:', e.message)
  process.exit(1)
})
```

要点：
- 参数一律 `--key=value` 形式（跨 shell 无引号问题）
- 失败输出与 MCP 工具同源的错误信息（都调 lib 同一函数），保证两种入口看到一致指引
