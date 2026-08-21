# 同事安装指南（apifox 接口文档）

适用：wbscf-web 团队。只读，不会对 Apifox 做任何写操作。

## 前置条件

- Node.js ≥ 18.14
- 已装 Claude Code
- 有 Apifox 账号的 **API 访问令牌**（Apifox 网页右上角头像 → 个人设置 → API 访问令牌 → 生成/复制）

## 一行安装

```bash
# Windows（在 claude-toolkit 仓库内）
node packages/apifox-mcp/scripts/setup.js --project=D:\projects\wbscf-web
```

向导交互：粘贴你的 API 令牌 → 自动部署 MCP + skill → 迁移清理旧条目 → 连通自检。完成后**开新会话**，说「查一下 ERP 订单查询接口的参数和返回值」验证。

没有令牌或想跳过交互，也可手动：

```bash
cp packages/apifox-mcp/config.example.json packages/apifox-mcp/config.json
# 编辑 config.json，把 token 字段替换成你的令牌
node packages/apifox-mcp/scripts/probe.js   # 验证 token 能拉到两个项目的 OAS
```

## 日常更新

统一走 claude-toolkit 的 `toolkit update apifox`。token 需要换时重新编辑 `config.json`。

## 常见问题

| 现象 | 处理 |
|---|---|
| probe 报 `token 未填` | config.json 里 token 还是占位文案，替换成真实令牌 |
| probe 报 `Please provide a token` | token 无效或未写入，检查 config.json |
| probe 报 `HTTP 401` | 令牌过期/被撤销，去 Apifox 重新生成 |
| probe 报 `工具名非固定` | 联系维护者，wrapper 的 `--tool-suffix=` 有问题 |
| 首次运行很慢 | 正常：npx 首次拉 `apifox-mcp-server@0.0.17`，之后有缓存 |

**安全**：`config.json` 含你的令牌，是 gitignore 的本地文件——不要打包外传、不要 commit。
