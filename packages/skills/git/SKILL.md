---
name: git
description: wbscf-web 的 git 工作流与提交规范：Conventional Commits 中文提交、commitlint 白名单、SCF/ERP 分支模型。当用户要求 commit/提交代码，或处理 git 命令、分支、合并、提交信息时使用。
metadata:
  version: "2.0.0"
---

# Git

> Git version control with Conventional Commits and project-specific workflows.

## Preferences（纪律）

- **只在当前分支操作**，不私自新建/切换分支；commit 和 push 都需要用户明确指令
- Claude 提交直接用 `git commit -m "type(scope): 描述"`。`pnpm commit`（czg）是交互式 TUI，只给人用，在非交互环境会挂起
- Never skip git hooks（禁止 `--no-verify`、`--no-gpg-sign`）
- Never commit Claude-related files（`.claude/`、CLAUDE.md）；提交信息中禁止携带任何 Claude Code 相关信息
- Never commit / checkout `vite.config.mts` 文件
- 临时验证用的测试文件不提交（验证通过后删除）
- push 只推当前分支：`git push -u origin HEAD`，禁止推送到按名字指定的其他分支

## 分支模型

| 分支 | 用途 |
|------|------|
| `master` | 发布线，PR 的目标分支 |
| `develop` | 日常集成分支，feature / hotfix 合入这里 |
| `feature/SCFxxxx`、`feature/ERPxxxx-MMDD` | 功能分支：单号 + 可选日期，如 `feature/SCF0050`、`feature/ERP0018-0803` |
| `hotfix/YYYYMMDD-N` | 线上修复分支，如 `hotfix/20260814-3`，修复合入 develop |

日常开发同步用 `git pull origin develop`（master 仅发布相关操作使用）。

## Commit 流程（Claude 执行）

```bash
# 1. 确认改动内容，只 stage 本次任务相关文件
git status
git diff --staged

# 2. 按「Commit Scope 查找规则」确定 scope，按 type 表确定类型，然后提交（描述用中文）
git commit -m "feat(进项发票): 新增批量导入功能"

# 3. pre-commit 的 prettier/eslint --fix 可能修改了文件但没有重新暂存（未开 stage_fixed）
#    检查 git status，若出现新的未暂存修改，补齐后并入本次提交
git status
git add <fixed-files>
git commit --amend --no-edit
```

## Commit Scope（模块名称查找规则）

**Scope 应使用最小子集单位的中文名称**（对应最具体的页面/功能模块名称）

### 查找方法（优先级从高到低）：

1. **优先：当前路由页面名称**
   - 根据修改的文件路径，定位到所属应用和路由模块
   - 查找 `apps/{app}/src/router/routes/modules/*.ts` 中对应路由的 `meta.title`
   - **直接使用完整的 `meta.title`** 作为 commit 的 scope（包括操作前缀如"新增"、"编辑"等）
   - `meta.title` 本身就是最具体的页面单位，无需任何简化或修改

2. **其次：文件所在功能模块目录名称**
   - 如果无法获取路由名称，或修改的是公共组件、工具函数等
   - 使用文件所在的功能模块目录名称

3. **最后：功能领域名称**
   - 如果以上都不适用，使用功能领域名称作为 scope

### 查找示例：

```
【示例 1 - 具体页面】
修改文件：apps/erp/src/views/purchase/input-invoice/xxx.vue
→ 查找路由：apps/erp/src/router/routes/modules/purchase.ts
→ 找到页面路由 meta.title: '进项发票'（最小单位）
→ commit: fix(进项发票): xxx

【示例 2 - 具体页面】
修改文件：apps/seller/src/views/agent/agent-settings/xxx.vue
→ 查找路由：apps/seller/src/router/routes/modules/agent.ts
→ 找到页面路由 meta.title: '代理设置'（最小单位）
→ commit: feat(代理设置): xxx

【示例 3 - 页面本身是模块】
修改文件：apps/erp/src/views/purchase/xxx.vue（采购管理列表页）
→ 查找路由：apps/erp/src/router/routes/modules/purchase.ts
→ 找到 meta.title: '采购管理'（这本身是最小单位）
→ commit: fix(采购管理): xxx

【示例 4 - 费用单详情页（带参数路由）】
修改文件：apps/erp/src/views/purchase/fee-list/detail.vue
→ 路由路径：console/purchase/fee-list/detail
→ 查找路由 meta.title: '费用单详情'
→ commit: feat(费用单详情): xxx

【示例 5 - 公共组件/工具】
修改文件：packages/@wbscf/common/components/xxx.vue
→ 无对应路由页面
→ 使用功能模块：common-ui
→ commit: feat(common-ui): xxx
```

### Commit 示例：

```bash
# 具体页面/功能级别（优先使用）
fix(进项发票): 修复红字发票表格校验错误提示样式
feat(代理设置): 新增代理优惠批量导入功能
style(店铺设置): 优化店铺设置页面布局
perf(库存列表): 优化库存列表加载性能
feat(费用单详情): 添加导出功能
fix(费用单管理): 修复金额计算错误

# 上级模块（当没有更具体的页面名称时使用）
fix(采购管理): 修复采购管理模块通用问题
chore(系统设置): 更新系统配置

# 公共组件/工具
feat(common-ui): 新增通用搜索组件
fix(vxe-table): 修复表格导出问题

# 通用改动（不涉及具体业务模块）
chore: 升级依赖版本
docs: 更新 README 文档
```

> **注意**: 尽量使用最具体的页面/功能名称作为 scope，避免使用过于宽泛的上级模块名称。

## Commit Types（Conventional Commits）

以下为 commit-msg 钩子（commitlint `type-enum`）强制校验的白名单：

| Type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `perf` | 性能优化 |
| `refactor` | 重构（不改行为） |
| `style` | 代码格式（不改逻辑） |
| `docs` | 文档 / 注释 |
| `test` | 测试 |
| `build` | 构建 / 依赖 |
| `ci` | CI / CD |
| `chore` | 杂项 / 工具链 |
| `revert` | 回滚提交 |
| `types` | 类型定义 |
| `release` | 发版 |

其他约束：header 总长 ≤ 108 字符；scope 可为任意中文名（如 `fix(进项发票):`）或省略；subject 不能为空，中文可用。`workflow` 不在白名单内，会被 commitlint 拒绝。

## Project Configuration

钩子、commitlint 规则、工具链的实际生效配置见 [project-setup](references/project-setup.md)。
