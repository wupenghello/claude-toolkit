---
name: claude-toolkit
description: wbscf-web 自制组件（MCP/skill）的统一管理。当需要安装/卸载/新增组件，或用户说"装一下 zentao"、"加个新 MCP/skill"、"管理一下组件"、"toolkit"时使用。
---

# claude-toolkit · 组件管理（给 AI 的接入指南）

加载这份文档后，你就能管理 wbscf-web 的所有自制组件——安装、卸载、新增、查依赖，无需用户手把手教。

- **仓库**：`D:\tools\claude-toolkit`
- **命令**：`toolkit`（已全局安装，任何目录直接敲）
- **目标项目**：`D:\projects\wbscf-web`（可用 `--project=<路径>` 覆盖）

## 0. 核心概念（先读，别猜）

- **组件** = 一个可独立安装/卸载的单元，可同时含 MCP 和 skill（如 `zentao` 组件 = zentao MCP + zentao skill）
- **registry.json** = 组件清单：每个组件声明它提供什么（`provides`）和依赖谁（`dependsOn`）
- **安装产物**：MCP → 项目 `.mcp.json` 的 `mcpServers`；skill → 项目 `.claude/skills/<name>/`
- **依赖自动解析**：装 A 时若 A 依赖 B，会自动先装 B（拓扑排序，依赖在前）

## 1. 查看状态

```bash
toolkit list
```

输出每个组件的「已装 / 未装」+ 提供的内容 + 依赖关系。

## 2. 安装组件

先 `toolkit list` 确认组件名（装错名字会报「未知组件」），再装：

```bash
toolkit install --all                  # 全部安装
toolkit install zentao sys-login       # 安装指定（多个，自动补依赖）
toolkit install                        # 交互式多选（仅真终端可用）
```

🚫 **你（Claude Code）执行时，用 `install --all` 或 `install <名字>`，不要跑无参数的交互式**——你的执行环境没有 TTY，无参数会降级成列表+引导，装了等于没装。

装完提示：MCP 工具需重启 Claude Code 会话生效；skill 由会话动态发现。

## 3. 卸载 / 更新

```bash
toolkit uninstall mcp-scaffold         # 卸载
toolkit update zentao                  # 覆盖式更新（= install 别名）
```

卸载若报「已被 xx 依赖」，是反向依赖保护——**这是预期行为，不是出错**：先卸载依赖它的组件，或如实告诉用户"xx 依赖它，不能单独卸"。

## 4. 加一个新组件

用户说「做新 MCP / 新 skill」时，**先触发 `mcp-scaffold` skill 生成标准工程**（index.js 模板、测试、安装器——它是"怎么做 MCP"的完整流程），做完再把产物放进 claude-toolkit：

1. **放源码**：MCP 组件 → `packages/<名字>-mcp/`（含 `index.js` + `skill/<名字>/SKILL.md`）；纯 skill → `packages/skills/<名字>/`
2. **登记**：在 `registry.json` 加一条（MCP 的 command/args 用相对仓库根的路径）
3. **校验 + 部署**：`npm test` 过结构校验（查路径存在、依赖无环、无悬空引用），再 `toolkit install <名字>`

registry 条目完整示例（MCP + skill 组件）：

```json
{
  "name": "xxx",
  "provides": {
    "mcpServers": { "xxx": { "command": "node", "args": ["packages/xxx-mcp/index.js"] } },
    "skills": [{ "name": "xxx", "from": "packages/xxx-mcp/skill/xxx" }]
  },
  "dependsOn": []
}
```

纯 skill 组件（如「禅道任务执行 skill」依赖 zentao MCP）：

```json
{
  "name": "zentao-task-exec",
  "provides": { "skills": [{ "name": "zentao-task-exec", "from": "packages/skills/zentao-task-exec" }] },
  "dependsOn": ["zentao"]
}
```

## 5. 敏感文件（红线）

🚫 这些文件是 gitignore 的，**绝不入库、绝不输出其内容**：

- `packages/sys-login-mcp/accounts.json` —— 登录测试账号密码
- `packages/zentao-mcp/config.json` —— 禅道/墨刀账号密码
- `packages/apifox-mcp/config.json` —— Apifox API 访问令牌（账号级，一个 token 访问其下所有项目）

别人 clone 后这些文件缺失，需自行填写（zentao / apifox 有 `config.example.json` 模板）。

**AI 安装 apifox 时的动作**：跑 `packages/apifox-mcp/scripts/setup.js` 会自动尝试从项目旧 `.mcp.json` 迁移 token；若仍缺，向用户索要「Apifox 头像 → 个人设置 → API 访问令牌」，用户给了才写入 config.json，用户没给就停下让用户手动填——**绝不编造 token**。

## 6. 当前组件清单

| 组件 | 提供 | 说明 |
|---|---|---|
| `zentao` | MCP + skill | 禅道任务/bug 拉取、图片识别、墨刀原型 |
| `sys-login` | MCP + skill | dev 环境自动登录（CNN 验证码识别 + 浏览器注入） |
| `apifox` | MCP + skill | Apifox 接口文档（ERP + 物泊智链，读 OAS / $ref / 刷新） |
| `mcp-scaffold` | skill | 工程化 MCP 脚手架（做新 MCP 时的标准流程） |
| `git` | skill | Git 提交规范（Conventional Commits + commitlint + wbscf-web 分支模型） |
| `claude-toolkit` | skill | 本指南（组件管理接入指南） |

## 7. 安装后怎么确认成功

- **skill**：`ls <项目>/.claude/skills/<名字>/SKILL.md` 存在即已部署
- **MCP**：`toolkit list` 显示「已装」即写入成功；但 MCP 工具要重启 Claude Code 会话后才出现在工具列表——重启前调用不到属正常，不是装失败了

## 8. 故障排查

- `toolkit list` 报「项目目录不存在」→ 目标项目路径不对，用 `--project=<实际路径>`
- 安装后 MCP 工具不可见 → 重启 Claude Code 会话
- `npm test` 失败 → registry.json 有路径/依赖错误，看报错行修正
- 组件功能异常（如 sys-login 登录失败）→ 看对应组件自己的 SKILL.md（在 `packages/<组件>/skill/<名字>/SKILL.md`）
