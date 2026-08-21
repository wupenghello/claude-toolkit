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

```bash
toolkit install --all                  # 全部安装
toolkit install zentao sys-login       # 安装指定（多个，自动补依赖）
toolkit install                        # 交互式多选（仅真终端可用）
```

🚫 **你（Claude Code）执行时，用 `install --all` 或 `install <名字>`，不要跑无参数的交互式**——你的执行环境没有 TTY，无参数会降级成列表+引导，装了等于没装。

装完提示：MCP 工具需重启 Claude Code 会话生效；skill 由会话动态发现。

## 3. 卸载 / 更新

```bash
toolkit uninstall mcp-scaffold         # 卸载（若被别的组件依赖会拦截）
toolkit update zentao                  # 覆盖式更新（= install 别名）
```

## 4. 加一个新组件（三步，做完就验收）

用户要做新 MCP/skill 时，按这个流程：

1. **放源码**：MCP 组件 → `packages/<名字>-mcp/`（含 `index.js` + `skill/<名字>/SKILL.md`）；纯 skill → `packages/skills/<名字>/`
2. **登记**：在 `registry.json` 加一条，声明 `provides`（MCP 的 command/args 用相对仓库根的路径，如 `packages/xxx/index.js`）和 `dependsOn`
3. **校验 + 部署**：`npm test` 过结构校验（会查路径存在、依赖无环、无悬空引用），再 `toolkit install <名字>`

依赖声明示例——「禅道任务执行 skill」依赖 zentao MCP：

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

别人 clone 后这些文件缺失，需自行填写（zentao 有 `config.example.json` 模板）。

## 6. 当前组件清单

| 组件 | 提供 | 说明 |
|---|---|---|
| `zentao` | MCP + skill | 禅道任务/bug 拉取、图片识别、墨刀原型 |
| `sys-login` | MCP + skill | dev 环境自动登录（CNN 验证码识别 + 浏览器注入） |
| `mcp-scaffold` | skill | 工程化 MCP 脚手架（做新 MCP 时的标准流程） |

## 7. 故障排查

- `toolkit list` 报「项目目录不存在」→ 目标项目路径不对，用 `--project=<实际路径>`
- 安装后 MCP 工具不可见 → 重启 Claude Code 会话
- `npm test` 失败 → registry.json 有路径/依赖错误，看报错行修正
- 组件功能异常（如 sys-login 登录失败）→ 看对应组件自己的 SKILL.md（在 `packages/<组件>/skill/<名字>/SKILL.md`）
