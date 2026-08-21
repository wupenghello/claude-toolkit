# 验收清单（工程化 MCP 完成的硬门槛）

全部勾完才算交付。逐项执行，不靠"看起来没问题"。

## 测试

- [ ] `npx vitest run` 全绿
- [ ] 单元测试不依赖任何外部路径/外部项目——在任何机器 clone 后都能跑
- [ ] 集成测试用 `describe.skipIf(外部依赖缺失)`，外部路径支持 `process.env.XXX ?? '默认'` 覆盖
- [ ] 长耗时用例显式 `{ timeout: 60000 }`（vitest 默认 5s 会误报失败）
- [ ] 测试不改写真实用户文件（被测函数支持路径注入，测试用 `os.tmpdir()` + afterEach 清理）
- [ ] 复刻外部算法的（加密/解析），必须有对拍测试（与原始实现逐字节/逐项一致）

## 冒烟（不启动 Claude 的真实运行）

- [ ] JSON-RPC 握手 + 工具列表：

```bash
printf '%s\n%s\n%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}' \
'{"jsonrpc":"2.0","method":"notifications/initialized"}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
| node index.js
```

  返回的 tools 数组包含全部预期工具，stderr 有启动日志，**stdout 无任何非协议输出**（日志只能走 console.error）
- [ ] `node scripts/probe.js` 核心链路真实走通（打真实目标，不是 mock）

## setup 幂等

- [ ] 首跑：完成全部安装步骤
- [ ] 二跑：每步显示"跳过/已就绪"，无重复注册、无重复写入
- [ ] 传不存在的 `--project` → 报错退出（exit 1）并给出示例命令
- [ ] 凭据未填时调用工具 → 错误信息含文件绝对路径 + 格式示例（这信息就是用户的操作指引）

## 安全

- [ ] `git ls-files` 不含凭据文件（accounts/config 类）、不含 node_modules
- [ ] .gitignore 已覆盖：node_modules/、凭据文件、*.log
- [ ] 工具返回中敏感字段已打码；密码类字段永不出现在返回值
- [ ] 仓库含公司系统细节的 → GitHub 上 Private

## 注册与分发

- [ ] `claude mcp add --scope project` 写入目标项目 `.mcp.json`（或已确认用户级需求）
- [ ] skill 部署到目标项目 `.claude/skills/<name>/`，内容自包含（不依赖任何会话记忆）
- [ ] README 快速开始 ≤3 步；macOS/Linux 用户知道要传 `--project`

## git 纪律

- [ ] `git init` + 首次 commit **等用户明确指令**
- [ ] 推送 `gh repo create <user>/<name>-mcp --private --source . --remote origin --push`，也等指令
- [ ] 推完更新记忆：仓库地址、工具集、注册位置
