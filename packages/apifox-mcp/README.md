# apifox-mcp

Apifox 接口文档 MCP 的 wrapper：读本地 `config.json` 的 token，spawn 官方 `apifox-mcp-server`（npx 远程包）并透传 stdio。

**为什么是 wrapper**：`apifox-mcp-server` 的 token 只能走环境变量 `APIFOX_ACCESS_TOKEN`。直接把 token 写进 `.mcp.json` 会随项目配置泄漏；wrapper 让 token 只存在于 gitignore 的 `config.json`。

覆盖两个 Apifox 项目：

| key | 项目 | project id |
|---|---|---|
| `erp` | ERP 接口聚合 | 7718065 |
| `wbzl` | 物泊智链接口聚合 | 6574890 |

每个项目提供 3 个只读工具：`read_project_oas`（读整份 OAS）、`read_project_oas_ref_resources`（读 `$ref` 子文件）、`refresh_project_oas`（刷新缓存）。

## 目录

```
index.js              wrapper 入口（读 config → spawn npx → stdio 透传）
lib/config.js         config.json 加载 + 项目解析
scripts/setup.js      一键安装/更新（凭据 + 部署 + 迁移清理 + 自检）
scripts/probe.js      连通自检（验证 token 拉 OAS + 工具名固定）
config.example.json   配置模板（入库）
config.json           真实 token（gitignore，本地生成）
skill/apifox/SKILL.md 配套 skill（教 AI 用这三个工具）
```

## 快速开始

安装与使用见 [INSTALL.md](INSTALL.md) / [USAGE.md](USAGE.md)。
