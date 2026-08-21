---
name: git-project-setup
description: wbscf-web 项目实际生效的 git 钩子、commitlint 规则与提交工具链配置
---

# 项目 Git 配置（实际生效）

## 提交工具链

| 工具 | 说明 |
|------|------|
| `pnpm commit` | 执行 `czg`（Commitizen 交互式 TUI，v1.11.1）。**给人用**；Claude 的 shell 是非交互的，会挂起，直接用 `git commit -m` |
| commitlint | 配置在 `.commitlintrc.js`，导出自 `@vben/commitlint-config`（源码：`internal/lint-configs/commitlint-config/index.mjs`） |
| 钩子管理 | Lefthook，配置文件为 `lefthook.yml`（注意不是 `.lefthook.yml`） |

## lefthook.yml 生效钩子

| 钩子 | 内容 |
|------|------|
| `pre-commit`（并行） | `pnpm vsh code-workspace --auto-commit`；按文件类型对 staged 文件执行 `prettier --write` / `eslint --fix` / `stylelint --fix`（覆盖 `.vue`、`.js/.jsx/.ts/.tsx`、`.md`、`.scss/.less/.styl/.html/.css`、`package.json`、`.json`） |
| `commit-msg` | `pnpm exec commitlint --edit $1` 校验提交信息 |
| `post-merge` | `pnpm install` 同步依赖 |

**注意**：pre-commit 的 `--fix` / `--write` 修改文件后，lefthook 不会自动重新暂存（未开 `stage_fixed`）。commit 之后要检查 `git status`，若出现钩子产生的未暂存修改，需 `git add` 后 `git commit --amend --no-edit` 并入本次提交。

## commitlint 关键规则

（源码：`internal/lint-configs/commitlint-config/index.mjs`，基于 `@commitlint/config-conventional`）

- `header-max-length`: ≤ 108 字符
- `type-enum` 白名单：`feat` / `fix` / `perf` / `style` / `docs` / `test` / `refactor` / `build` / `ci` / `chore` / `revert` / `types` / `release`
  - ⚠️ `workflow` 会出现在 czg 的交互提示里（typesAppend），但**不在** commitlint 白名单内，用它会被 commit-msg 钩子拒绝
- `scope-enum`: 已禁用，`function-rules/scope-enum` 放开为任意非空字符串——中文模块名（如 `fix(进项发票):`）合法，scope 也可省略
- `subject-empty` / `type-empty`: 不允许为空；`subject-case` 已禁用，中文 subject 合法

## 仓库结构

- pnpm + turbo monorepo，应用：`apps/buyer`、`apps/seller`、`apps/account`、`apps/erp`、`apps/ops`
- 远程 `origin` → `http://git.esteel.tech/brcc/wbtech/fe/platform/wbscf-web.git`
- 分支模型：`master`（发布线 / PR 目标）、`develop`（日常集成）、`feature/SCFxxxx`、`feature/ERPxxxx-MMDD`、`hotfix/YYYYMMDD-N`
