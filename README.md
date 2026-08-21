# claude-toolkit

wbscf-web 自制组件的统一管理：**一个 Monorepo 装下所有 skill 和 MCP，一份注册表声明依赖关系，一条命令选择性安装**。

不再为每个新组件单独建仓库——新组件放进 `packages/` 目录、在 `registry.json` 登记一条即可，依赖关系（如"装某 skill 自动带上某 MCP"）靠 `dependsOn` 声明。

## 怎么用

**大多数时候你不需要碰它**——组件装好后已自动生效。你在 Claude 里说"登录 erp"、"看看 bug-7551"，AI 会直接调用 sys-login、zentao 这些 MCP 工具。

只有两种情况需要手动敲命令：**加了新组件要部署**、**换机器/重新装**。

### 常用命令（`toolkit` 已全局安装，任何目录直接敲）

```bash
toolkit list                       # 看所有组件 + 已装/未装
toolkit install                    # 交互式：输入编号（如 1,3）或 all 选择安装
toolkit install zentao             # 装指定组件（自动补依赖）
toolkit install --all              # 一键全装
toolkit update sys-login           # 覆盖式更新
toolkit uninstall mcp-scaffold     # 卸载（被别的组件依赖时会拦截）
```

装到哪：默认 `D:\projects\wbscf-web`（MCP 写进 `.mcp.json` 的 `mcpServers`、skill 放进 `.claude/skills/`）。装到别的项目加 `--project=<路径>`（macOS/Linux 必传）。

> 注意：`toolkit` 是 `npm link` 装的全局命令，指向 `D:/tools/claude-toolkit` 里的脚本。改源码即生效，无需重装。

### 换机器 / 给别人用

```bash
git clone https://github.com/wupenghello/claude-toolkit.git D:/tools/claude-toolkit
cd D:/tools/claude-toolkit
npm install                          # workspaces 一次装所有子包依赖
npm link                             # 让 toolkit 成为全局命令
toolkit install --all                # 部署到项目
```

换机器后要补敏感文件（gitignore 不入库）：`packages/sys-login-mcp/accounts.json`（登录账号）、`packages/zentao-mcp/config.json`（禅道/墨刀密码，有 `config.example.json` 模板可复制）。

## 加一个新组件（三步）

1. **放源码**：MCP 组件放 `packages/<名字>-mcp/`（含 `index.js` + `skill/<名字>/SKILL.md`）；纯 skill 放 `packages/skills/<名字>/`
2. **登记**：在 `registry.json` 加一条，声明 `provides`（MCP 的 command/args 用相对仓库根的路径）和 `dependsOn`
3. **校验 + 部署**：`npm test` 过结构校验，然后 `toolkit install <名字>`

### 依赖声明示例

```json
{
  "name": "zentao-task-exec",
  "provides": { "skills": [{ "name": "zentao-task-exec", "from": "packages/skills/zentao-task-exec" }] },
  "dependsOn": ["zentao"]
}
```

`toolkit install zentao-task-exec` 会自动先把 `zentao` MCP 装上。

## 目录

```
registry.json         组件清单：name / description / provides(mcpServers+skills) / dependsOn
scripts/install.js    统一安装器 CLI（list / install / update / uninstall）
lib/registry-core.js  核心逻辑（依赖拓扑排序、MCP 合并、skill 部署、状态检测、损坏备份）
test/registry.test.mjs  vitest 测试
packages/
├─ zentao-mcp/        禅道 MCP + skill
├─ sys-login-mcp/     自动登录 MCP + skill
└─ skills/
   └─ mcp-scaffold/   工程化 MCP 脚手架 skill
```

## 敏感文件（gitignore，不入库）

- `packages/sys-login-mcp/accounts.json` — 登录测试账号
- `packages/zentao-mcp/config.json` — 禅道/墨刀账号密码（模板 `config.example.json` 入库）

## 测试

```bash
npm test    # vitest：注册表结构校验 + 依赖拓扑 + MCP 合并保留第三方 + 损坏备份 + 安装/卸载
```
