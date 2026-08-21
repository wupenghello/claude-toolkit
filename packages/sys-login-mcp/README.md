# sys-login-mcp

wbscf-web dev 环境自动登录 MCP server。解决 AI 做完需求后浏览器验证时「没有账号 + 登录有图片验证码」的问题。

仅限 wbscf-web 项目使用（MCP 注册在项目 `.mcp.json`，skill 部署在项目 `.claude/skills/`）。

**跨平台**：Windows / macOS / Linux 均可（纯 Node，无平台专有依赖）。macOS/Linux 安装时必须传 `--project`（Windows 默认路径不适用）；`npm test` 的集成测试默认跳过本机不存在的外部项目，如有克隆可通过环境变量 `WBSCF_ROOT` / `EXT_TEST` 指定路径启用。

## 快速开始

```bash
git clone <本仓库> D:/tools/sys-login-mcp   # 克隆位置任意，但需记住（MCP 注册会指向这里的绝对路径）
cd D:/tools/sys-login-mcp
node scripts/setup.js --project=<你的 wbscf-web 路径>   # 如 D:/code/wbscf-web；不传则默认 D:/projects/wbscf-web
```

setup 会交互式询问测试账号（别名/手机号/密码/备注），结束打印"下一步"清单，正常流程只有三步：

1. **填账号**：setup 过程中会交互式询问（别名/手机号/密码/备注）；跳过了也没关系——之后调用 `sys_login` 报错时错误信息自带 accounts.json 路径和格式示例
2. **重启 Claude Code 会话**（MCP 工具生效）
3. **验证**：`npm run probe -- --app=erp` 命令行直测；或在 Claude 里说"登录 erp 验证"

## 能力（MCP 工具）

- `sys_login(app, account?)`：用测试账号登录指定应用（erp/ops/account/buyer/seller）的 dev 后端，返回 token + 可直接 `preview_eval` 执行的注入代码。优先 `type=auto` 免验证码，失败自动走 CNN 图片验证码识别（最多 5 轮，置信度 <0.75 直接换码不提交）。
- `sys_status()`：账号 / CNN 权重 / 各后端连通性。
- `sys_accounts()`：列出账号别名（密码不外露）。
- `sys_captcha_solve(app?)`：拉一张验证码识别，诊断 CNN 是否失效。

用法编排见项目级 skill `sys-login`（源文件 `skill/sys-login/SKILL.md`）。

## 目录结构

| 文件 | 说明 |
|---|---|
| `index.js` | MCP server 入口（官方 SDK + stdio） |
| `scripts/setup.js` | 一键安装/更新（幂等），bin: `sys-login-setup` |
| `scripts/probe.js` | CLI 探测（登录/验证码/连通），bin: `sys-login-probe` |
| `lib/captcha-cnn.js` | CNN 前向传播，自 captcha-ext 的 cnn.js 移植（仅 atob→Buffer、window→ESM export 两处差异，函数体逐行一致） |
| `lib/captcha-image.js` | PNG 解码（pngjs）→ HSL 二值化 → 4 槽位裁剪，与插件 recognizer.js / 训练侧 prep.js 逐行等价 |
| `lib/crypto.js` | 密码 AES-128-CBC 加密，复刻 wbscf-web `packages/wbscf/src/utils/crypto.ts` |
| `lib/login-core.js` | 登录主流程与错误分类 |
| `lib/inject-builder.js` | 按 app 生成浏览器注入代码（erp/account/buyer/seller→cookie；ops→两个 localStorage；均内置 authStatus 清理） |
| `lib/config.js` | 应用→后端映射表、账号/权重加载 |
| `tools/extract-weights.mjs` | 从 captcha-ext 的 weights.js 转换 weights.json |
| `test/unit.test.mjs` | 单元测试（错误分类/注入生成/AES 已知向量/应用表），无外部依赖 |
| `test/integration.test.mjs` | 集成测试（AES 对拍 crypto-js、CNN 40 张标注样本回归 ≥96%），外部依赖缺失时自动跳过 |
| `test/verify-cnn.mjs` / `verify-crypto.mjs` | 独立验证脚本（npm run verify-cnn / verify-crypto） |
| `skill/sys-login/SKILL.md` | 配套 skill 源文件 |

本地文件（**gitignore，永不入库**）：

- `accounts.json`：`{"default":"dev1","accounts":[{"alias":"dev1","username":"手机号","password":"明文","note":"备注"}]}`（setup 会生成模板）

随仓库分发（入库）：

- `weights.json`：CNN int8 权重（127KB 纯数值张量，不含 captcha-ext 源码）——**CNN 能力开箱即用，不依赖 captcha-ext 项目**。`npm run extract-weights` 仅供维护者在插件重训后更新它。

## 常用命令

```bash
npm test                # vitest：单元 + 集成（12 个用例）
npm run setup           # 一键安装/更新
npm run probe -- --app=erp [--account=dev1]   # 完整登录探测
npm run probe -- --captcha=erp                # 只测验证码识别
npm run probe -- --reach                      # 只测后端连通
npm run extract-weights # 插件重训后更新权重
```

## 维护

- **后端验证码样式变更**（CNN 失效）：需维护者按 `D:\projects\captcha-ext\README.md`「后端验证码变更时」重训并导出，然后 `npm run extract-weights` 更新仓库内的 `weights.json` 并推送——其他使用者直接拉取即可，无需接触训练管线。
- **登录接口变更**（参数/路径/加密方式）：改 `lib/login-core.js` / `lib/crypto.js`，对照 wbscf-web 的 `apps/*/src/api/core/auth.ts`，同步更新 `test/unit.test.mjs` 的已知向量。
- **新增应用或端口变更**：改 `lib/config.js` 的 `APPS` 表 + wbscf-web 的 `.claude/launch.json`。
- **CI 无外部依赖也能跑**：集成测试在缺少 wbscf-web / captcha-ext-test 时自动 skip，只剩单元测试。

## 注册方式（setup 已自动完成）

MCP：wbscf-web 项目 `.mcp.json` 的 `sys-login` 条目（command `node`，args 指向本项目 `index.js`）。Skill：`D:\projects\wbscf-web\.claude\skills\sys-login\`。修改后需重启 Claude Code 会话生效。
