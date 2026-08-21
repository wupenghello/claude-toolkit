# claude-toolkit

wbscf-web 自制组件的统一管理：**一个 Monorepo 装下所有 skill 和 MCP，一份注册表声明依赖关系，一条命令选择性安装**。

不再为每个新组件单独建仓库——新组件放进 `packages/` 目录、在 `registry.json` 登记一条即可，依赖关系（如"装某 skill 自动带上某 MCP"）靠 `dependsOn` 声明。

## 快速开始

```bash
node scripts/install.js            # 交互式选择要装的组件（输入编号或 all）
node scripts/install.js list       # 看全部组件 + 已装/未装 + 依赖关系
node scripts/install.js install zentao sys-login   # 命令行指定，自动补依赖
node scripts/install.js install --all              # 全装
node scripts/install.js update zentao               # 覆盖式更新（= install 别名）
node scripts/install.js uninstall mcp-scaffold     # 卸载（有反向依赖会拦截）
# 指定目标项目（默认 D:/projects/wbscf-web；macOS/Linux 必传）:
node scripts/install.js --project=/Users/xxx/code/wbscf-web install
```

安装产物：MCP → 项目 `.mcp.json` 的 `mcpServers`（**保留 apifox 等第三方条目**）；skill → 项目 `.claude/skills/<name>/`。MCP 工具需重启 Claude Code 会话生效。

## 目录

```
registry.json         组件清单：name / description / provides(mcpServers+skills) / dependsOn
scripts/install.js    统一安装器 CLI（list / install / uninstall）
lib/registry-core.js  核心逻辑（依赖拓扑排序、MCP 合并、skill 部署、状态检测）
test/registry.test.mjs  vitest 测试
packages/
├─ zentao-mcp/        禅道 MCP + skill（迁自原 D:\tools\zentao-mcp）
├─ sys-login-mcp/     自动登录 MCP + skill（迁自原 D:\tools\sys-login-mcp）
└─ skills/
   └─ mcp-scaffold/   工程化 MCP 脚手架 skill（迁自原 D:\tools\claude-skills）
```

## 加一个新组件

1. 源码放 `packages/`（MCP 组件含 `index.js` + `skill/<name>/`；纯 skill 放 `packages/skills/<name>/`）
2. 在 `registry.json` 登记：声明 `provides`（MCP 的 command/args 用相对仓库根的路径）、`dependsOn`（依赖的组件名）
3. `npm test` 过结构校验（会检查路径真实存在、依赖无环、无悬空引用）
4. `node scripts/install.js install <name>` 安装

## 依赖声明示例

```json
{
  "name": "zentao-task-exec",
  "provides": { "skills": [{ "name": "zentao-task-exec", "from": "packages/skills/zentao-task-exec" }] },
  "dependsOn": ["zentao"]
}
```

安装它时自动先装 `zentao` MCP。

## 敏感文件（gitignore，不入库）

- `packages/sys-login-mcp/accounts.json` — 登录测试账号
- `packages/zentao-mcp/config.json` — 禅道/墨刀账号密码（模板 `config.example.json` 入库）

## 测试

```bash
npm test    # vitest：注册表结构校验 + 依赖拓扑 + MCP 合并保留第三方 + 安装/卸载
```
