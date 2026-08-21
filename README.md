# claude-toolkit

给你的 AI 配的一套工具箱：**一个仓库装下所有自制的小工具，一条命令就能装、卸、加新的**。

## 🚀 给 AI 用（最重要）

想让 AI 自动装好这套工具，把下面这行丢给 AI 就行：

```bash
curl -s https://raw.githubusercontent.com/wupenghello/claude-toolkit/master/AI_INSTALL.md
```

AI 拿到后会自己完成「下载 → 装依赖 → 装工具 → 验证」全流程，**不用你手敲任何命令**。

## 它是什么

这里装着几个让 AI 更好用的小工具：

| 工具 | 能干嘛 |
|---|---|
| 自动登录（sys-login） | 验证页面时自动登录系统，不用手输账号和验证码 |
| 禅道（zentao） | 拉取禅道的任务、bug，还能识别截图 |
| Apifox 接口文档（apifox） | 查后端接口的参数、返回值，不用翻网页 |
| 脚手架（mcp-scaffold） | 以后做新工具时的标准模板 |
| Git 规范（git） | 提交信息、分支怎么建，按团队规范来 |

这些工具装好之后**自动就生效了**——你对 AI 说「登录 erp」「看看 bug-7551」，AI 自己就会用对应工具，你平时根本不用碰这个仓库。

## 什么时候需要手动操作

只有两种情况：

1. **加了新工具**，要装到项目里
2. **换电脑 / 重新装**

其余时间放着不用管。

## 常用命令

```bash
toolkit list                     # 看现在装了哪些工具
toolkit install --all            # 把所有工具都装上
toolkit install zentao           # 只装某一个（比如禅道）
toolkit uninstall mcp-scaffold   # 卸掉某个工具
toolkit update zentao            # 更新某个工具到最新
```

命令装到哪个项目？默认是 `D:\projects\wbscf-web`。要装到别的项目，在命令后加 `--project=<项目路径>`。

## 换电脑 / 给别人用

```bash
git clone https://github.com/wupenghello/claude-toolkit.git D:/tools/claude-toolkit
cd D:/tools/claude-toolkit
npm install        # 自动装好所有依赖
npm link           # 让 toolkit 命令在任何目录都能用
toolkit install --all
```

> 换电脑后有几样账号密码要**重新填**（登录系统的账号、禅道的密码）。这些文件为了安全不会上传到网上，所以新电脑上是空的，需要手动补上。禅道那个有 `config.example.json` 样例文件，照着改即可。

## 加一个新工具（三步）

1. 把新工具的代码放到 `packages/` 目录里
2. 在 `registry.json`（工具清单）里登记一行，写清楚：这个工具**提供什么**、**依赖谁**
3. 跑 `npm test` 检查无误，再 `toolkit install <名字>` 装进项目

**依赖关系**是自动处理的：比如「拉禅道任务」这个工具依赖「禅道」工具，清单里写上一句依赖，装它的时候会自动把禅道也一起装上，不用你手动一个个装。

## 目录是干嘛的

```
registry.json     工具清单：每个工具叫什么、提供什么、依赖谁
scripts/install.js  那条 toolkit 命令的本体
packages/           工具的代码都在这
├─ zentao-mcp/        禅道工具
├─ sys-login-mcp/     自动登录工具
├─ apifox-mcp/         接口文档工具
├─ skills/mcp-scaffold/  做新工具的模板
└─ skills/git/          Git 提交规范
```

## 不想看技术细节的话

记住这三点就够了：

1. **平时不用管**——工具装好自动生效，AI 会用
2. **要装/卸/看**——用 `toolkit` 开头的几条命令
3. **加新工具**——代码放 `packages/`，清单登记一行，`toolkit install` 装一下
