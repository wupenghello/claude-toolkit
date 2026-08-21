---
name: mcp-scaffold
description: 工程化 MCP server 脚手架。当用户要"做一个 MCP / MCP server / MCP 工具"，或要把某段能力沉淀成可分发的 MCP 时使用。按 zentao-mcp / sys-login-mcp 的成熟模式生成完整工程：server + setup 一键安装 + probe CLI + vitest + 凭据管理 + 项目级注册 + 配套 skill 分发。
metadata:
  author: wupeng
  version: "1.0.0"
---

# mcp-scaffold：工程化 MCP server 脚手架

参照 `D:\tools\zentao-mcp` 与 `D:\tools\sys-login-mcp` 两个成熟样本，产出可直接 `git push` 分发的完整工程。

## 第一步：确认设计（缺信息先问，别猜）

1. **能力与工具集**：这个 MCP 提供哪几个工具？每个工具的入参/返回是什么？（工具名前缀统一，如 `zentao_*` / `sys_*`）
2. **仓库位置**：默认 `D:\tools\<name>-mcp\`（与现有两个工具并列）
3. **注册到哪**：默认项目级（`--project` 指向使用它的项目，如 `D:\projects\wbscf-web`）。用户明确要跨项目才用用户级。
4. **凭据/配置**：有没有账号、密钥类本地文件？（必须走 gitignore + 模板 + 交互式录入模式）
5. **外部依赖**：核心逻辑是否复刻前端/其他项目的代码（如加密算法）？——对拍验证是硬要求。

## 第二步：生成工程

目录结构（模板见本目录 references/，占位符 `{{name}}`/`{{PREFIX}}`/`{{TOOLS}}` 替换后写入）：

```
D:\tools\{{name}}-mcp\
├─ index.js               # MCP server：官方 SDK + StdioServerTransport（照 templates.md）
├─ package.json           # type:module + bin×3 + scripts + devDeps vitest
├─ lib\*.js               # 业务模块（按职责拆分，不写大单体）
├─ scripts\setup.js       # 一键安装（照 setup-template.md，逐条对照六要素）
├─ scripts\probe.js       # CLI 探测：不启动 Claude 直接验证核心链路
├─ test\unit.test.mjs     # 单元测试：无任何外部依赖，任何机器可跑
├─ test\integration.test.mjs  # 集成测试：describe.skipIf(外部依赖缺失)，路径支持 env 覆盖
├─ skill\{{name}}\SKILL.md    # 配套 skill 源（教 AI 编排 MCP 工具，setup 负责部署）
├─ .gitignore             # node_modules/ + 凭据文件 + *.log
└─ README.md              # 快速开始(3步内)/目录表/常用命令/维护/跨平台说明
```

**工具返回的硬规矩**（决定 AI 用得顺不顺）：
- 成功返回结构化 JSON 文本（AI 要精确取字段）；失败返回 `{ok:false, error, detail, hint}`——错误信息**自带下一步指引**（文件绝对路径 + 格式示例），让 AI 看到就知道怎么提醒用户。
- 敏感字段打码（参考 sys-login 的 maskPhone）；密码类字段永不出现在任何返回里。
- 工具 description 写清"什么时候用"，这是 AI 选工具的依据。

**setup.js 六要素**（缺一不可，详见 setup-template.md）：
1. 幂等（每步先查存在再执行，重复跑只更新该更新的）
2. 项目路径存在性校验（不存在→报错+示例命令，防 macOS 默认路径坑）
3. 凭据文件：占位模板检测 + TTY 交互式录入 + 非 TTY 打印指引
4. `claude mcp add --scope project`（execSync 失败时给出手动配置的完整说明）
5. skill 部署（copyFileSync 覆盖式更新）
6. 结尾打印编号的「下一步」清单（含未完成项的醒目提示）

## 第三步：验收（全过才算完成）

按 references/checklist.md 逐项过，其中硬性门槛：
- `npx vitest run` 全过；单元测试不依赖任何外部路径
- `node index.js` JSON-RPC 冒烟：initialize + tools/list 能列出全部工具（照 checklist 的 printf 命令）
- `node scripts/setup.js` 连跑两次：第二次全部"跳过/已就绪"
- `node scripts/probe.js` 核心链路真实走通
- `git ls-files` 确认无凭据文件、无 node_modules

## 第四步：git 与分发

- `git init` + 首次 commit **必须等用户明确指令**（纪律）
- 推送用 `gh repo create <user>/<name>-mcp --private --source . --remote origin --push`，**默认 Private**（内部系统细节不公开），用户要公开再改
- 推完更新记忆：仓库地址、工具集、注册位置

## 关键经验（都是踩过的坑）

- MCP 注册写入配置后，**新会话才生效**；当前会话已建立的连接不受影响
- Windows 下给 pnpm/npm 传参**不要写 `--` 分隔符**（会被原样透传导致 vite 等工具解析失败）
- 长任务的 vitest 用例要显式 `it('...', { timeout: 60000 }, ...)`（默认 5s）
- 测试绝不改写真实用户文件——被测函数支持路径注入，测试用 os.tmpdir()
- 集成测试的外部项目路径一律 `process.env.XXX ?? '默认路径'`，macOS 上自动 skip 而不是报错
- 错误分类/关键词判定注意中文文案多词命中问题，靠判定顺序保证正确归类，并有真实场景测试用例锁住
