# 使用说明（apifox 接口文档）

装好后在 Claude 里直接用自然语言问接口定义即可，无需记工具名。

## 触发示例

| 你说 | AI 做什么 |
|---|---|
| 「查一下订单查询接口的参数」 | 判断归属（ERP/物泊智链）→ `read_project_oas` 定位接口 → 输出参数表 |
| 「这个接口返回哪些字段」 | 同上，重点输出返回值 schema |
| 「接口文档刚更新了，看最新版」 | 先 `refresh_project_oas` 刷新缓存，再读 |
| 「下单接口的请求体结构」 | 定位接口 → 有 `$ref` 则 `read_project_oas_ref_resources` 展开 |

## 两个项目怎么区分

- **ERP 接口聚合**（server `apifox-erp`）：内部管理类接口（订单/库存/采购等）
- **物泊智链接口聚合**（server `apifox-wbzl`）：客户/物流侧接口（返利/金融等）

不确定归属时 AI 会两个都查。你也可以直接指定：「用物泊智链的文档查返利接口」。

## 三个工具

| 工具 | 什么时候用 |
|---|---|
| `read_project_oas` | 查接口定义（最常用） |
| `read_project_oas_ref_resources` | OAS 里出现未展开的 `$ref` 时，按 path 取子文件 |
| `refresh_project_oas` | 文档更新后、或怀疑缓存旧时刷新 |

## 边界

- **只读**：不能改 Apifox 里的接口定义。要改请去 Apifox 网页操作。
- **文档 vs 代码冲突**：AI 会指出差异让你确认，不会擅自以文档为准改代码。
- 文档内容有缓存：如果觉得结果和 Apifox 网页对不上，先让它 `refresh`。
