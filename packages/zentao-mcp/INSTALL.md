# 同事安装指南（zentao-mcp + /zentao skill）

适用：禅道 12.5.3 专业版（pm.esteel.tech）+ 公司前端仓库。只读，不会对禅道做任何写操作。

## 前置条件

- Node.js ≥ 18.14（`getSetCookie` 硬需求；推荐 LTS）
- git 已安装并对 GitHub 鉴权（首次：`gh auth login` 或让 Git Credential Manager 弹浏览器授权）
- 已接受 `wupenghello/zentao-mcp` 仓库的协作者邀请（邮件里点 Accept）
- 能访问 `pm.esteel.tech` 与 `modao.cc`
- Chrome 或 Edge（墨刀渲染用；没有也不影响禅道功能）
- 已装 Claude Code

## 一行安装（推荐）

```bash
# Windows
git clone https://github.com/wupenghello/zentao-mcp.git D:\tools\zentao-mcp && node D:\tools\zentao-mcp\scripts\setup.js
# macOS / Linux
git clone https://github.com/wupenghello/zentao-mcp.git ~/tools/zentao-mcp && node ~/tools/zentao-mcp/scripts/setup.js
```

向导交互：填**你自己的**禅道账号密码（墨刀可选）→ 自动 npm install / 注册 MCP / 安装 skill / 连通自检。
完成后**开新会话**，说「看看指派给我的任务」验证。

PowerShell 用户请分两条执行（`&&` 语义差异）：

```powershell
git clone https://github.com/wupenghello/zentao-mcp.git D:\tools\zentao-mcp
node D:\tools\zentao-mcp\scripts\setup.js
```

## 日常更新

```bash
cd D:\tools\zentao-mcp && git pull        # Windows
cd ~/tools/zentao-mcp && git pull         # macOS / Linux
```

`package.json` 有变动时再 `npm install`。版本锚点看 CHANGELOG 与 git tag。

## 手工安装（兜底，不用向导时）

1. `npm install --registry=https://registry.npmmirror.com`
2. `config.example.json` 复制为 `config.json` 填自己账号（或全走环境变量 `ZENTAO_*`）
3. `claude mcp add zentao --scope user -- node "<安装目录>/index.js"`
4. 拷 `skill/zentao/SKILL.md` 到 `~/.claude/skills/zentao/`（Windows 即 `C:\Users\<你>\.claude\skills\zentao\`），把 `{{INSTALL_DIR}}` 替换成实际目录

## 常见问题

| 现象 | 处理 |
|---|---|
| clone 报 404/权限 | 协作者邀请没接受；或 git 没登录 GitHub |
| 自检报"用户名或密码错误" | 填错账号；禅道密码以 pm.esteel.tech 登录页为准 |
| 自检报验证码 | 失败次数过多，浏览器登录一次禅道再重跑 |
| `claude` 命令不存在 | 先装 Claude Code；或跳过注册用手工步骤 3 |
| npm 镜像不通 | 去掉 `--registry` 用默认源重试 |

安装后的目录含你的密码与会话 cookie：**不要**打包外传、**不要** commit 进业务仓库。
