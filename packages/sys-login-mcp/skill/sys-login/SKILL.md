---
name: sys-login
description: wbscf-web 各应用（erp/ops/account/buyer/seller）dev 环境自动登录。当需要在浏览器验证页面但被登录页或图片验证码挡住时使用；通过 sys-login MCP 的 sys_login 工具拿 token 并注入浏览器。用户说"登录系统验证"、"页面要登录态"等场景也触发。
metadata:
  author: wupeng
  version: "1.0.0"
---

# sys-login：dev 系统自动登录

解决两个拦路问题：① 没有测试账号（账号存放在 sys-login-mcp 仓库目录的 accounts.json，本地文件不入库；未配置时 sys_login 的报错会给出确切路径和格式）；② 登录页图片验证码（MCP 内置 CNN 识别）。

## 标准流程

1. **启动 dev server**：`preview_start`（项目 launch.json：`erp-dev`→5668、`account-dev`→5661、`ops-dev`→5660；buyer 5662 / seller 5663 无配置时先在 launch.json 加）
2. **登录**：调用 MCP 工具 `sys_login(app)`（app ∈ erp/ops/account/buyer/seller；用默认账号可省 `account` 参数）。返回里有 `evalCode`、`reloadCode`、`devUrl`
3. **注入**：确保浏览器在对应 devUrl 域下（必要时先 `preview_eval` 执行 `window.location.href = '<devUrl>'`），然后 `preview_eval` 执行返回的 `evalCode`
4. **刷新**：`preview_eval` 执行 `reloadCode`（即 `window.location.reload()`）
5. **确认**：`preview_snapshot` 确认已不在登录页（看到菜单/用户信息即成功）；页面变更类需求此时再做正常验证

## 各应用速查

| app | devUrl | launch 配置 | 注入方式 |
|---|---|---|---|
| erp | http://localhost:5668/console/ | erp-dev | cookie |
| ops | http://localhost:5660/ | ops-dev | localStorage ×2 |
| account | http://localhost:5661/account/ | account-dev | cookie |
| buyer | http://localhost:5662/buyer/ | （无，需临时加） | cookie（共享） |
| seller | http://localhost:5663/seller/ | （无，需临时加） | cookie（共享） |

关键事实：cookie `wbscf-i-userInfo-localhost` 在 localhost **各端口共享**——account/erp 登录种下的 cookie 对其他应用同样有效；**ops 例外**（它只认自己 localStorage 里的 token，必须单独 sys_login('ops')）。

## 特例与注意

- **buyer / seller**：无独立登录页（无 cookie 会被硬跳账号中心）。注入 cookie 后仍被踢到认证页 = 账号没有 `currentCompanyId` → 换账号，或告知用户该账号需先在 account 侧完成公司会话。
- **erp**：多公司账号登录后可能弹"选择公司"弹窗 → 尽量用单公司测试账号；弹窗出现时报告用户，不要乱点。
- **account**：登录后页面可能自动跳商城首页（正常行为），`preview_eval` 导航回 devUrl 即可。
- token 有时效，页面突然回到登录页就重新走一遍流程（登录很快，不要缓存旧 token）。

## 故障排查

- **注入 cookie 后仍回登录页、且 cookie 消失** → 先查 `localStorage.authStatus` 是否残留 `logout_*`（跨标签登出广播，残留会让凭据被忽略）。`sys_login` 返回的 evalCode 已内置 `localStorage.removeItem('authStatus')`；手动拼注入代码时务必带上这句。
- `sys_login` 返回 `captcha_exhausted` / `captcha_format` → CNN 已失效（后端验证码改版）。用 `sys_captcha_solve` 复核；确认失效后告知用户：需由 sys-login-mcp 维护者重训并更新仓库内 weights.json（使用者拉取更新即可，重训管线不在本工具仓库内）。
- `sys_login` 返回 accounts.json 相关错误（不存在/是占位模板/解析失败）→ 把错误信息中的文件路径和格式示例原样转告用户，让用户填入真实测试账号后重试；这不是重试能解决的问题。
- `credential` → 账号密码错误（accounts.json），告知用户修正，不要反复重试。
- `network` → 对应 dev 后端不通，让用户确认 VPN/网络。
- **ops 落在 404 页** → 认证其实已通过（守卫放行、权限码已拉取），是账号没有 ops 菜单权限（菜单接口返回空数组）导致无路由可生成；需换有 ops 菜单的账号。
- **seller 被导流到账号中心「公司名片」页** → 认证已通过（登录态正常渲染），是账号无卖家公司会话的产品导流；进卖家中心需账号完成卖家认证。
- 一切正常但注入后仍回登录页 → 检查 preview 浏览器地址是否在正确端口/路径（evalCode 注入的 cookie 作用域是当前域）。
