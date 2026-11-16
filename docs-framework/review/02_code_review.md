# 代码审查报告（阶段 5）

> 审查范围：认证、管理、支付、记录同步四条核心链路。
> 审查方式：逐行阅读 + 与 `docs-framework/` 契约对照 + 现有测试反推边界。
> 结论：无阻断性缺陷；发现 2 个并发风险、1 个安全降级风险、1 个可维护性问题，均已给出修改建议。

## 1. 逐行原理解释：管理员退款

`AdminService.refundOrder`（`AdminService.java` 154-184 行）：

1. `requireOrder(outTradeNo)`：按订单号查 `orders`，不存在直接 404；避免对空订单调用支付宝。
2. 校验 `status == paid`：只有支付成功的订单可退，防止对未支付/已关闭订单发起退款。
3. `alipay.alipayMissing()`：缺 `ALIPAY_APP_ID`、应用私钥或支付宝公钥时直接拒绝，避免“本地标记退款但钱没退”。
4. `alipay.refund(outTradeNo, amountCent, "管理员退款")`：全额退款，`out_request_no` 固定为订单号，支付宝按同一笔退款去重。
5. `UPDATE orders SET status='refunded', refunded_at=NOW() WHERE out_trade_no=? AND status='paid'`：条件更新是幂等闸门，只有仍为 `paid` 时生效。
6. `revokeVipDays(userId, days)`：仅当订单状态真的更新成功才扣回天数。
7. 写 `operation_log`：成功记 `SUCCESS`，状态被并发改动记 `FAILURE`。
8. 返回最新 `AdminOrderView`；状态已变化时抛 409，提示刷新。

## 2. 致命风险排查

| 级别 | 位置 | 风险 | 建议 |
|---|---|---|---|
| 高 | `AuthService.java:49-62` | 注册先 `selectCount` 再 `insert`，并发下两个请求都通过检查，后插入者触发唯一索引异常，返回 500 而不是 409 | 捕获 `DuplicateKeyException` 转为 `AuthException(DUPLICATE)`；唯一索引已存在，无需加锁 |
| 高 | `AdminService.java:60-72` | 两个管理员同时停用对方：都读到「启用管理员 = 2」，随后都更新成功，最终 0 个管理员 | 加事务 + `SELECT ... FOR UPDATE`，或用带子查询的条件更新 |
| 中 | `LoginRateLimiter.java:23,65-78` | Redis 故障时内存计数 `Map` 无上限，攻击者用随机账号/IP 可撑大内存 | 给 Map 设置上限与定期清理，或按 IP 聚合 |
| 中 | `AuthService.java:151` + `TokenBlacklist.java:44-48` | 改密后若 Redis 不可用，旧令牌不会被拉黑，仍可用到自然过期 | 至少记录告警；可加本机短期黑名单兜底 |
| 中 | `AdminService.java:154-184` | 支付宝退款成功、但本地订单更新失败时，返回 409，审计记为 `FAILURE`，需要人工核对 | 退款成功后即使本地失败也应记 `SUCCESS` 并在详情标注「待修复」；或加对账任务 |
| 低 | `PayService.java:179-188` | 通知金额用 `Double.parseDouble` 转分，极端小数存在精度风险 | 改用 `BigDecimal` 比较 |
| 低 | `application.yml:47` | 默认 `JWT_SECRET` 可直接启动，生产若忘记覆盖会使用弱密钥 | 生产环境显式设置；或在 prod profile 强制非默认值 |

## 3. 性能瓶颈

| 位置 | 现象 | 判断 |
|---|---|---|
| `JwtAuthenticationFilter.java:47` | 每个请求查一次 `users` 校验状态 | 可接受；这是“停用立即生效”的代价。若 QPS 高，可加 30 秒 Redis 缓存并在停用时主动删缓存 |
| `AdminService.pageOrders` | `COUNT(*)` 带 `LEFT JOIN users` | 数据量小时无问题；订单量大时建议先按 `orders` 过滤再 join |
| `RecordsService.replaceRecords` | 先删后批量插入，单事务 | 实现正确；8MB 上限内可接受 |
| `LoginRateLimiter` | 每次登录 1 次 Redis INCR | 正常，TTL 自动过期 |
| `RecordsService.readRecords` | 固定 7 次查询 | 无 N+1，可接受 |

## 4. 重构建议

### 4.1 拆分 RecordsService（674 行）

现状：校验、写入、读取、JSON 转换全部在一个类里，超出 200-300 行约定。

建议拆为：

```text
service/records/
├─ RecordsService.java        # 对外编排：replace / read / clear
├─ RecordValidator.java       # 字段校验与错误话术
├─ RecordWriter.java          # deleteAll + batch insert
├─ RecordReader.java          # 行转驼峰
└─ RecordJson.java            # JsonNode 工具
```

只移动代码，不改行为；拆分后按现有集成测试回归。

### 4.2 去掉对 MySQL 赋值顺序的依赖

`AdminService.java:186-197`：

```sql
UPDATE users SET plan_expires_at = ..., 
  plan = CASE WHEN plan_expires_at IS NOT NULL AND DATE_SUB(plan_expires_at, INTERVAL ? DAY) > NOW() ...
```

第二列依赖第一列的新值，依赖 MySQL「从左到右赋值」的实现细节。

建议先算出新到期时间，再用一个明确条件更新：

```sql
UPDATE users
SET plan_expires_at = CASE WHEN plan_expires_at IS NULL THEN NULL
                           ELSE DATE_SUB(plan_expires_at, INTERVAL ? DAY) END,
    plan = CASE WHEN plan_expires_at IS NULL THEN plan
                WHEN DATE_SUB(plan_expires_at, INTERVAL ? DAY) > NOW() THEN 'pro'
                ELSE 'free' END
WHERE id = ?
```

或在 Java 中读出到期时间、计算后一次写入，语义更直观。

### 4.3 注册并发处理

```java
try {
    users.insert(user);
} catch (DuplicateKeyException e) {
    throw new AuthException(ResultCode.DUPLICATE, "账号已被占用", HttpStatus.CONFLICT);
}
```

### 4.4 金额解析

```java
// 改前
Long cents = Math.round(Double.parseDouble(yuan) * 100);
// 改后
Long cents = new BigDecimal(yuan).movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
```

## 5. 审查结论

- 认证、支付、退款、同步的主流程与边界测试均通过。
- 建议优先处理：注册并发 500、最后管理员并发、限流内存上限。
- `RecordsService` 拆分属于可维护性改造，可在功能冻结后进行。
- 本文档只给建议，未改动业务代码；确认后再逐项修复并补测试。

## 6. 修复记录（2026-11-15）

| 问题 | 处理 | 对应测试 |
|---|---|---|
| 注册并发可能返回 500 | `AuthService.register` 捕获 `DuplicateKeyException`，统一转 409001 | `AuthServiceTest.registerConcurrentDuplicate` |
| 最后管理员并发可能清零 | `AdminService.setStatus` 加 `@Transactional`，用 `SELECT ... FOR UPDATE` 锁住启用中的管理员行后再判断 | `AdminServiceTest.keepLastAdmin`、`disableAdminWithAnotherActive` |
| 限流内存 Map 无上限 | 上限 5000 个键，超限先清理过期窗口，仍满则拒绝新键；已有键继续按 5 次/分钟计数 | `LoginRateLimiterTest.fallbackMapBounded` |

- 修复后单元测试 42 个全部通过，MySQL 集成测试 4 个通过。
- 其余中低优先问题（改密黑名单 fail-open、退款对账标记、金额解析精度、RecordsService 拆分）保留为后续建议，未在本次改动范围内。
