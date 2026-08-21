# claude-toolkit · 安装指南（给 AI 的接入文档）

把这份文档交给你的 AI 助理（Claude Code / Cursor / 任意 ReAct agent），它就能自动完成安装、配置、验证，**无需你手敲任何命令**。

装完之后，AI 就能：在验证 wbscf-web 页面时自动登录系统（`sys-login`）、拉取禅道任务/bug（`zentao`）、按标准流程新建工具（`mcp-scaffold`）。

## 0. 前置检查（AI 先确认，缺什么让用户装）

```bash
node -v        # 需 ≥ 18.14
git --version  # 需可用
```

目标项目需已初始化 Claude Code（项目根有 `.claude` 目录；没有则让用户先 `claude` 初始化该项目）。

## 1. 克隆仓库

```bash
git clone https://github.com/wupenghello/claude-toolkit.git D:/tools/claude-toolkit
```

- 仓库是私有的，用户需先有 GitHub 访问权限（没有会 clone 失败，提示用户授权）
- clone 位置可换，但记住绝对路径，后续 `--project` 等参数要用

## 2. 安装依赖

```bash
cd D:/tools/claude-toolkit
npm install
```

（workspaces 自动装好所有子包依赖）

## 3. 全局 link（让 `toolkit` 命令随处可用）

```bash
npm link
toolkit list   # 能跑通即成功
```

## 4. 配置敏感文件（🚫 停下来向用户索要，AI 绝不编造）

以下文件是 gitignore 的，clone 后**不存在**，需用户提供真实账号：

| 文件 | 内容 | 模板 |
|---|---|---|
| `packages/sys-login-mcp/accounts.json` | 登录测试账号密码 | 无，格式见下文 |
| `packages/zentao-mcp/config.json` | 禅道/墨刀账号密码 | `packages/zentao-mcp/config.example.json` |

`accounts.json` 格式：

```json
{ "default": "dev1", "accounts": [{ "alias": "dev1", "username": "手机号", "password": "密码", "note": "备注" }] }
```

**AI 的做法**：向用户询问这些账号，用户给了才写入文件；用户没给就停在这一步，不要编造占位符糊弄过去。

## 5. 部署组件到目标项目

```bash
toolkit install --all --project=<目标项目绝对路径>
```

- 默认项目是 `D:/projects/wbscf-web`，其他项目**必须显式传 `--project`**（macOS/Linux 必传）
- `--all` 会装全部组件；只想装部分用 `toolkit install <组件名>`（如 `toolkit install zentao`）

## 6. 验证

```bash
toolkit list
```

应显示 4 个组件都「已装」：zentao、sys-login、mcp-scaffold、claude-toolkit。

## 7. 重启 Claude Code 会话

- **MCP 工具**（sys-login、zentao）需重启会话才出现在工具列表——这是正常的，不是装失败
- **skill** 由会话动态发现，无需重启

## 8. 完成后的使用

装完后，用户对 AI 说：

- 「登录 erp / 验证页面」→ 触发 sys-login 自动登录
- 「看看 bug-7551 / 拉禅道任务」→ 触发 zentao
- 「做个新 MCP」→ 触发 mcp-scaffold
- 「装/卸/加组件」→ 触发 claude-toolkit skill（组件管理）

## 故障排查

- `toolkit list` 报「项目目录不存在」→ `--project` 路径错了，改成实际项目绝对路径
- clone 报 403/404 → 用户没有仓库访问权限，让其到 GitHub 授权
- `npm install` 失败 → 网络/Node 版本问题，确认 Node ≥ 18.14
- 装完 MCP 工具仍不可见 → 确认已重启 Claude Code 会话
