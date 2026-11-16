# 接口契约评审（QA 视角）

> 评审对象：`01_PRD.md` 页面元素、`02_Architecture.md` 模块边界、`03_Database.md` 表结构、`04_API.md` 接口。
> 评审方式：按「页面功能 → 接口 → 表」逐项对照，检查遗漏、冗余、越权与文档/代码不一致。
> 说明：本评审由同一模型完成；按规范仍需一次异源模型复核（阶段 1b），见文末待办。

## 1. 页面功能 → 接口映射

| 页面/功能 | 支撑接口 | 结论 |
|---|---|---|
| 欢迎页登录入口 | `GET /api/v1/auth/demo`、`POST /api/auth/alipay/start` | 齐全 |
| 账号密码登录/注册 | `POST /api/v1/auth/login`、`/register` | 齐全 |
| 快捷登录 | `POST /api/v1/auth/demo-login` | 齐全，受环境变量控制 |
| 账号信息 | `GET /api/session` | 齐全，含 `role` |
| 修改密码 | `POST /api/v1/auth/change-password` | 齐全 |
| 最近操作 | `GET /api/v1/auth/operation-logs` | 齐全，仅本人 |
| 退出 / 注销 | `DELETE /api/session`、`DELETE /api/account` | 齐全 |
| 订阅状态 / 购买 | `GET /api/plan`、`POST /api/pay/order`、`GET /api/pay/order` | 齐全 |
| 支付回调 | `POST /api/pay/notify` | 齐全，验签 + 金额校验 |
| 云端备份 | `POST /api/data/sync`、`GET /api/data`、`DELETE /api/data` | 齐全 |
| 管理后台入口 | `GET /api/session` 的 `role` | 齐全 |
| 账号管理 | `GET /api/v1/admin/users`、`PATCH .../status`、`POST .../vip` | 齐全 |
| 订单管理 | `GET /api/v1/admin/orders`、`POST .../close`、`POST .../refund` | 齐全 |
| 操作日志 | `GET /api/v1/admin/operation-logs` | 齐全 |
| 导出/导入/清空本机 | 无接口 | 合理，纯本地功能 |
| 模型连通性测试 | 无接口 | 合理，浏览器直连 |

**查漏结论**：页面元素均能找到接口或明确的“本地实现”归属，无阻断性缺口。

## 2. 查冗

| 冗余项 | 说明 | 处理建议 |
|---|---|---|
| `/api/v1/auth/me` 与 `/api/session` | 都返回当前账号，`/api/session` 额外含 `uidTail/displayName` | 当前保留：前者属认证域，后者兼容旧前端；文档标注用途，V2 再收敛 |
| `POST /api/v1/auth/logout` 与 `DELETE /api/session` | 都执行 JWT 登出 | 前端当前使用 `DELETE /api/session`；V2 择一保留 |
| `sessions` 表 | JWT 上线后不再写入 | 保留兼容与清理，V2 可移除 |
| `GET /api/v1/auth/demo` | 仅为隐藏前端卡片 | 合理，避免生产暴露入口 |

**查冗结论**：无必须立即删除的接口；冗余均为兼容成本，已标注演进方向。

## 3. 安全审查

| 风险点 | 现状 | 判断 |
|---|---|---|
| 越权访问管理接口 | `/api/v1/admin/**` 强制 `hasRole('ADMIN')` + `@PreAuthorize` | 通过 |
| 订单查询越权 | 校验 `orders.user_id == 当前用户`，否则 403 | 通过 |
| 云端记录越权 | 所有读写按 `CurrentUser.id()` 过滤 | 通过 |
| 退款/关单越权 | 仅管理员接口，写审计日志 | 通过 |
| 支付通知伪造 | RSA2 验签 + `app_id` + 金额比对 + 状态校验 | 通过 |
| 重复发货 | `UPDATE ... WHERE status='created'` 条件更新 | 通过 |
| 登录暴力破解 | Redis 限流 5 次/分钟，Redis 故障回退内存 | 通过 |
| 停用账号仍可用旧 Token | JWT 过滤器每次查 `users.status` | 通过 |
| 体验登录误开 | 默认 false，需显式 `DEMO_LOGIN_ENABLED=true` | 通过（生产需复核环境变量） |
| 模型 Key 泄露 | 仅存 localStorage，后端不落库 | 可接受；XSS 是其固有风险 |
| 无 Token 刷新 | 2 小时过期后需重新登录 | 已知限制，V2 处理 |
| 审计日志被删 | 不提供删除接口、无外键 | 通过 |

## 4. 文档与代码不一致（已回写）

| 项 | 问题 | 处理 |
|---|---|---|
| `GET /api/session` 示例 | 缺少 `role` 字段，但代码已返回 | 已在 `04_API.md` 补 `role` |
| 注册 curl 示例 | 缺少必填 `acceptedTerms` | 已补 `acceptedTerms:true` |
| 认证错误格式 | 认证/管理为 `{code,message,data}`，记录/支付为 `{error}` | 文档已分别说明，保持现状 |

## 5. 阶段 1 结论

- 契约可以支撑现有页面与接口，无阻断性缺口。
- 遗留冗余属于兼容成本，不阻塞开发。
- **待办（阶段 1b）**：将本目录四份文档与 `flow/` 交给不同厂商的长文本模型做异源交叉审查，重点找一致性、闭环缺口与越权路径；产出结论后回写到本文件。
