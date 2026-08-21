# 禅道 × Claude Code 集成使用说明

> 版本：1.0（2026-08-19） · 适用：禅道 12.5.3 专业版（`http://pm.esteel.tech/zentao`）+ 本仓库（wbscf-web）及其他前端仓库

## 一、这套东西是什么

两个组件配合工作：

| 组件 | 位置 | 职责 |
|---|---|---|
| **zentao MCP server** | `<安装目录>`（如 `D:\tools\zentao-mcp` 或 `~/tools/zentao-mcp`） | 数据层：登录禅道、拉取 bug/任务详情、下载截图、抓站内链接。**只读**，不会在禅道里做任何写操作 |
| **/zentao skill** | `~/.claude/skills/zentao/SKILL.md` | 工作流层：把"取内容 → 识图 → 代码分析 → 出迭代方案"固化成固定流程，用户级 skill，**所有仓库的会话都能用** |

认证方式：web session 登录（`md5(md5(密码)+verifyRand)` + cookie），账号密码存在 `<安装目录>/config.json`，cookie 缓存在 `.session.json`，无需每次登录。

## 二、快速上手

### 前提

1. `config.json` 里已填好账号密码（已完成）。
2. **开一个新会话**。MCP 工具在会话启动时加载，注册后开的新会话才有 `zentao_*` 工具。可用 `claude mcp list` 确认 `zentao: ✔ Connected`。

### 你可以怎么说

| 你说 | 会发生什么 |
|---|---|
| `禅道 bug 7551` / `bug-view-7551` / `7551 这个 bug 看下` | 拉该 bug 详情 + 识别全部截图 + 解析链接 → 定位本仓库代码 → 输出迭代方案 |
| `任务 8841` / `task 8841` | 同上，针对任务 |
| `拉一下指派给我的任务` / `看看我有什么 bug` | 列清单，你再挑编号 |
| `/zentao` | 显式触发 skill |
| `识别下这个 bug 的截图` | 单独走 `zentao_get_image` |

类型不明确时（比如只给数字）Claude 会 bug/任务各试一次，不需要你记前缀。

### 一次完整交互长这样

```
你：禅道 bug 12697 出个方案

Claude：
  1. zentao_get_bug 拉详情（标题/状态/重现步骤/评论）
  2. 详情里每张截图调 zentao_get_image 逐张识别（截图往往是定位关键）
  3. 描述里的禅道链接（关联需求/任务）自动跟进抓取
  4. 按截图 UI 特征、字段名、菜单名在本仓库 Grep/Glob 定位相关页面与组件
  5. 输出固定结构的迭代方案（见下），然后停下等你确认

你：可以，按这个改

Claude：开始改代码（遵守项目规则：不动公共组件、改完跑单测、commit 等你指令）
```

方案输出固定包含五段：**禅道 #编号理解（含截图信息）→ 相关代码 → 改动方案 → 风险与回归点 → 测试要点**。确认前不会动代码。

## 三、MCP 工具手册

| 工具 | 参数 | 说明 |
|---|---|---|
| `zentao_status` | — | 查登录状态、配置地址与账号 |
| `zentao_my_work` | `type?: all\|bug\|task` | 指派给我的 bug/任务清单（id、标题、状态、优先级、所属迭代） |
| `zentao_get_bug` | `id: number` | bug 详情：基本信息、重现步骤、图片/链接清单、历史与评论 |
| `zentao_get_task` | `id: number` | 任务详情：基本信息、任务描述/需求描述/验收标准、图片/链接清单、历史 |
| `zentao_get_image` | `url: string` | 下载禅道图片并以图像返回供视觉识别（url 来自详情里的图片清单，如 `/zentao/file-read-15523.png`） |
| `zentao_fetch_link` | `url: string` | 抓禅道站内链接转文本；bug/task 链接会自动提示改用详情工具 |
| `modao_fetch` | `url: string` | 无头浏览器渲染墨刀（modao.cc）共享原型：整页截图 + 画布列表 + 批注文本。共享链接通常匿名可看；私有链接自动用 config 里的 modao 账号登录 |

在会话里这些工具以 `mcp__zentao__zentao_get_bug` 之类的全名出现，正常对话即可，不需要你手动指定。

## 四、目录结构（想改东西时看）

```
<安装目录>/
├── config.json          # 账号密码（明文，.gitignore 保护，勿外传）
├── .session.json        # 登录 cookie 缓存
├── index.js             # MCP server 入口（工具注册、输出格式化）
├── lib/
│   ├── zentao-client.js # 登录/请求/下载/cookie 持久化
│   ├── zentao-page.js   # 页面 HTML 解析（详情、列表、历史）
│   └── html.js          # HTML→文本、图片/链接提取
├── scripts/probe.js     # 调试探针（见下）
├── tmp/                 # 临时下载目录
└── README.md / USAGE.md
```

调试命令（在安装目录下）：

```bash
node scripts/probe.js login            # 验证登录
node scripts/probe.js bug 7551         # 看 bug 解析结果
node scripts/probe.js task 8841        # 看任务解析结果
node scripts/probe.js mywork           # 看指派清单
MSYS_NO_PATHCONV=1 node scripts/probe.js img /zentao/file-read-15523.png   # 下载图片
```

> Git Bash 里直接粘贴 `/zentao/...` 路径会被 MSYS 转义，加 `MSYS_NO_PATHCONV=1` 前缀即可（MCP 正常调用不受影响）。

## 五、FAQ / 排障

| 现象 | 原因与处理 |
|---|---|
| 新会话里没有 `zentao_*` 工具 | `claude mcp list` 看是否 Connected；不 Connected 多为 node 路径问题，重新 `claude mcp add zentao --scope user -- node "<安装目录>/index.js"` |
| 报"登录失败/验证码" | 失败次数过多触发验证码：先在浏览器登录一次禅道再试；或检查 config.json 密码是否改过 |
| 报"无权限访问" | 该账号在禅道里没有对应页面权限（如 my-work 模块）；工具已改用有权限的 `my-bug-assignedTo` / `my-task-assignedTo` |
| 图片清单有图但识别不到 | 确认 url 是禅道域内（`/zentao/file-read-*.png`）；域外链接工具会拒绝（安全策略） |
| 禅道改了密码 | 同步改 `config.json`；必要时删 `.session.json` 重新登录 |
| 想加写操作（回评论/改状态） | 当前设计为只读。需要时在 `index.js` 增加工具并放开表单 POST，注意风险自负 |

## 5.5、环境变量与回归测试

- 环境变量优先于 config.json：`ZENTAO_BASE_URL / ZENTAO_ACCOUNT / ZENTAO_PASSWORD / MODAO_ACCOUNT / MODAO_PASSWORD`，适合无交互调试。
- 回归测试：`npm test`（vitest，HTML fixture 基线在 `test/fixtures/`）。禅道改版导致解析变红时：`node scripts/capture-fixtures.js` 重抓基线 → 修 `lib/zentao-page.js` → 回绿。

## 六、为什么不走禅道 REST API（背景）

专业版把 `api.php/v1/*` 全部锁在"应用 code"鉴权后面（所有请求返回"缺少code参数"，需管理员在后台建应用拿 code），且 `t=json` 输出被禁用。session 登录方式只需要你自己的账号、无需管理员配合，行为与浏览器完全一致；将来若拿到应用 code，可在 `zentao-client.js` 里平滑切换。

## 七、安全与边界

### 🚫 只读红线

**禅道信息只允许拉取（只读），绝不允许更改、评论、改状态、上传、新建等任何写操作。**

- 代码级强制：`lib/zentao-client.js` 的 `fetch` 拦截除登录表单外的所有非 GET/HEAD 请求，任何工具（含未来新增）都无法对禅道发写请求。
- skill 级约束：`/zentao` 流程遇到写禅道的要求会拒绝，并改为提供"草稿文本"供你手动粘贴。
- 需要同步状态/回评论时：由你本人在禅道里操作。
- 凭证仅存在于本机 `config.json`（明文）与 `.session.json`（cookie）。目录现为**私有 git 仓库**，两者由 `.gitignore` 保护永不入库；也不要把它拷进业务仓库。
- 密码曾在对话中出现过，介意可改一次禅道密码并同步 config.json。
- skill 流程遵守项目既有纪律：不改 `packages/` 与 `apps/erp/src/components/` 公共组件；实现后单测验证通过即删测试文件；commit/push 必须等你明确指令。
