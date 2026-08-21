# zentao-mcp

面向禅道 12.5.3 专业版的只读 MCP server。提供任务/bug 内容拉取、附件截图识别、墨刀（modao.cc）原型渲染能力，配合 `/zentao` skill 完成"需求理解 → 代码分析 → 迭代方案"的完整工作流。

> **分发范围**：本项目包含公司内部信息（禅道实例地址、业务术语、页面 fixture），仅以私有仓库形式在团队内部分发。
>
> **安全约束**：只读是设计红线——server 在客户端层拦截除登录外的所有非 GET 请求，任何工具都无法对禅道执行写操作（改状态、评论、编辑、新建、上传等）。

## 功能特性

- 禅道任务/bug 详情拉取：描述、字段、历史记录、评论，HTML 自动转结构化文本
- 禅道截图下载并以图像形式返回，供视觉识别
- "指派给我的"工作清单（bug / 任务）
- 墨刀共享原型渲染：headless 系统浏览器打开 SPA，返回整页截图、画布清单与批注文本
- 会话自治：web session 登录、cookie 持久化、会话失效自动检测与重登
- 回归保护：真实页面 HTML fixture + vitest 单测，禅道改版可即时发现

## 前置条件

| 依赖 | 要求 | 说明 |
|---|---|---|
| Node.js | ≥ 18.14 | `fetch` 与 `headers.getSetCookie()` 的硬需求 |
| Git | 任意版本 | 需已完成 GitHub 鉴权（`gh auth login` 或凭证管理器） |
| GitHub 权限 | 协作者 | 需接受 `wupenghello/zentao-mcp` 的协作邀请 |
| 网络 | 内网可达 | `pm.esteel.tech`（禅道）与 `modao.cc` |
| 浏览器 | Chrome 或 Edge | 仅墨刀渲染需要；缺失时禅道功能不受影响 |
| Claude Code | 任意版本 | MCP 宿主 |

## 安装

```bash
# Windows
git clone https://github.com/wupenghello/zentao-mcp.git D:\tools\zentao-mcp && node D:\tools\zentao-mcp\scripts\setup.js

# macOS / Linux
git clone https://github.com/wupenghello/zentao-mcp.git ~/tools/zentao-mcp && node ~/tools/zentao-mcp/scripts/setup.js
```

安装目录可自行指定，保持命令中两处路径一致即可。`setup.js` 依次完成：

1. 依赖安装（默认使用国内镜像）
2. 交互式配置本人禅道账号（墨刀账号可选）
3. 注册 MCP server（user 级，所有仓库可用）
4. 安装 `/zentao` skill 至用户目录并按实际路径渲染模板
5. 连通性自检（登录 + 拉取指派清单）

完成后**新开一个 Claude Code 会话**（MCP 工具在会话启动时加载），输入「看看指派给我的任务」验证。

手工安装、异常处理与卸载见 [INSTALL.md](./INSTALL.md)。

## 使用

在 Claude Code 会话中直接以自然语言触发：

| 输入示例 | 行为 |
|---|---|
| `看看指派给我的任务` | 列出当前账号的 bug / 任务清单 |
| `禅道 bug 7551` / `task 8841` | 拉取详情、识别截图、解析链接 |
| `任务 8799 出个方案` | 完整工作流：取内容 → 识图 → 墨刀渲染 → 一致性校验 → 代码分析 → 迭代方案 |

工作流细节（含"任务名与墨刀原型一致性校验"、方案输出模板）见 [skill 说明](./skill/zentao/SKILL.md) 与 [USAGE.md](./USAGE.md)。

## MCP 工具

| 工具 | 参数 | 说明 |
|---|---|---|
| `zentao_status` | — | 登录状态与配置检查 |
| `zentao_my_work` | `type?: all\|bug\|task` | 指派给我的清单 |
| `zentao_get_bug` | `id` | bug 详情（步骤/字段/历史/媒体清单） |
| `zentao_get_task` | `id` | 任务详情（描述/需求/验收标准/媒体清单） |
| `zentao_get_image` | `url` | 禅道域内图片下载并视觉识别 |
| `zentao_fetch_link` | `url` | 禅道站内链接转文本 |
| `modao_fetch` | `url` | 墨刀原型渲染（截图 + 画布清单 + 批注） |

## 配置

凭证存储于安装目录 `config.json`（各人独立，受 `.gitignore` 保护，禁止外传）。环境变量优先级高于配置文件，适用于无交互场景：

| 环境变量 | 对应配置 |
|---|---|
| `ZENTAO_BASE_URL` | `baseUrl` |
| `ZENTAO_ACCOUNT` / `ZENTAO_PASSWORD` | `account` / `password` |
| `MODAO_ACCOUNT` / `MODAO_PASSWORD` | `modao.account` / `modao.password` |
| `ZENTAO_MCP_CHROME` | 显式指定墨刀渲染所用浏览器路径 |
| `ZENTAO_MCP_NO_CLAUDE` | setup 跳过注册与 skill 安装（CI/沙箱） |

## 架构

```
index.js            工具层：MCP 工具注册与输出格式化
lib/zentao-client   禅道会话客户端：登录、请求、下载、只读红线拦截
lib/zentao-page     禅道页面解析器：详情 / 列表 / 历史 / 媒体
lib/modao-client    墨刀渲染：playwright-core + 系统浏览器（不下载浏览器）
lib/html.js         HTML → 文本、图片与链接提取
lib/config.js       配置加载：环境变量 > config.json
skill/zentao        /zentao 工作流模板，setup 时安装到 ~/.claude/skills
```

认证说明：禅道专业版的 REST API 被应用级 `code` 鉴权锁定、`t=json` 输出被禁用，故采用与浏览器一致的 web session 登录（`md5(md5(密码) + verifyRand)`）。会话失效表现为"200 + script 跳转登录页"，客户端在正文层检测并自动重登。

## 测试与维护

```bash
npm test                          # vitest 回归（fixture + 红线 + 配置）
node scripts/capture-fixtures.js  # 禅道改版后重抓 fixture 基线（手工执行）
node scripts/probe.js bug 7551    # 调试探针：查看解析结果
node scripts/test-redline.js      # 只读红线手工回归
```

测试红即表示线上解析已受影响：重抓 fixture → 修正 `lib/zentao-page.js` → 回绿。

## 更新

```bash
cd <安装目录> && git pull   # package.json 有变动时再 npm install
```

版本锚点见 [CHANGELOG.md](./CHANGELOG.md) 与 git tag。

## 许可

[MIT](./LICENSE)
