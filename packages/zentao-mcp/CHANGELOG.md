# Changelog

本项目所有 notable 变更记录于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [Unreleased]

### 变更
- 跨平台：`modao_fetch` 浏览器探测支持 macOS/Linux 常见安装路径，新增 `ZENTAO_MCP_CHROME` 环境变量显式指定
- 文档与 skill 模板路径平台中性化（`{{INSTALL_DIR}}/config.json`、mac 一行安装示例）
- README 按规范结构重写（功能/前置/安装/使用/工具/配置/架构/测试/更新）
- skill v1.1.0：硬闸门（取内容失败/注入/前端无法满足必停）、方案模板增加「待确认问题」段、一致性校验泛化到全部链接、确认语义与批量编号处理

## [1.0.0] - 2026-08-20

### 新增
- 禅道只读 MCP server：`zentao_status` / `zentao_my_work` / `zentao_get_bug` / `zentao_get_task` / `zentao_get_image` / `zentao_fetch_link` 六工具
- 墨刀原型渲染工具 `modao_fetch`（headless 系统 Chrome，共享链接匿名可看，登录作私有链接兜底）
- 只读红线：客户端拦截除登录外一切非 GET/HEAD 请求（代码级强制）
- web session 登录（md5(md5(密码)+verifyRand)）、cookie 持久化、会话失效正文级检测自动重登
- 禅道 12.5.3 专业版页面解析器（详情/列表/历史/媒体提取）
- `/zentao` skill 工作流：取内容→识图→墨刀→任务名与原型一致性校验→代码分析→五段式方案
- `scripts/setup.js` 一键安装向导与 `scripts/probe*.js` 调试探针
- HTML fixture + vitest 回归测试
