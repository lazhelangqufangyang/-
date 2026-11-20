# PAYATHON P1：支付闭环 + 最小管理后台 设计文档

- 状态：**M1–M4 已实现并通过端到端验证（2026-11-19）；M5 文档与演示脚本已完成。** 真实支付宝环境与商业化外部条件待办，见 `payment-acceptance-report.md` 第 5 节。
- 日期：2026-11-19
- 关联：PAYATHON 2026 · Vibe Pay 赛道（报名截止 12-01，作品提交截止 12-09，评审期 12-10 至 12-25）
- 依据：赛事活动细则原文（render.alipay.com 活动细则页）、Vibe Pay 接入文档（aipay.alipay.com）
- 验收：`payment-acceptance-report.md`；演示：`payathon-demo-script.md`

## 1. 为什么做这三件事

线上初赛评审权重：

| 维度 | 权重 | 与本文档的关系 |
| --- | --- | --- |
| 产品完整度 | 30% | 已有，不在本文档范围 |
| 支付集成度 | 25% | 细则明写「支付**成功/失败/退款**的反馈是否清晰」→ 退款必做 |
| 商业化成熟度 | 25% | 统计 2026-09-21 至 12-09 通过 AI 付完成的**真实有效交易去重用户数**；虚假交易剔除 |
| 作品影响力 | 20% | 作品详情页浏览/点赞/评论，运营动作，不在本文档范围 |

硬性口径（来自细则原文）：

1. 商业化只认真实交易，**沙箱不算**。
2. Vibe Pay **基础收款能力**必须先开通【网页应用收款】或【移动应用收款】（aipay 官网或 AI付接入 Skill），否则付费用户不计入统计。
3. 报名账号必须与接入 AI 付产品的支付宝账号是同一账号。
4. 作品必须正式部署，评审期可正常访问。

因此 P1 范围锁定为：**主动查单 + 退款 + 最小管理后台（查单/补发/撤销/审计）+ 用户侧支付反馈**。对账下载、关单、定时任务不进 P1。

## 2. 现状盘点（代码事实）

| 能力 | 位置 | 状态 |
| --- | --- | --- |
| 下单跳收银台 | `PayService.payUrl`（`page.pay` / `wap.pay`），`PayController` `POST /api/pay/order` | 已有 |
| 异步通知验签/金额/幂等发货 | `PayController.notify`、`PayService.checkNotify/settle`、`AccountService.fulfill` | 已有，质量高于文档要求 |
| 订单表 | `server/schema.sql` `orders`（out_trade_no / trade_no / amount_cent / status） | 已有 |
| 权益 | `users.plan` + `users.plan_expires_at`，发货时续加天数 | 已有 |
| 用户会话 | `sessions`（token 哈希）、`TokenSupport.bearer`、`AccountService.requireUser` | 已有 |
| 支付宝网关调用 | `AlipayClient.exec(...)`（私有）：签名、HTTP、回执验签、错误码处理 | 已有，**可直接复用** |
| 主动查单 | — | 缺 |
| 退款 / 退款查询 | — | 缺 |
| 关单 / 对账 | — | 缺（不进 P1） |
| 管理端 / 审计 | — | 缺 |
| 用户侧退款/失败反馈 | `AccountCard.jsx` 只处理 paid | 缺 |

`AlipayClient.exec` 已经处理了「回执必须带签名、business 节点验签、code != 10000 抛 `AlipayException`」，新增查单/退款只需在 `AlipayClient` 增加三个 public 方法，把参数塞进 `biz_content` 即可，不重写 HTTP/签名层。

## 3. 范围

### In

- `alipay.trade.query` 主动查单（管理页手动 + 用户回跳自动兜底）
- `alipay.trade.refund` 全额退款 + 本地权益回收 + 退款状态展示
- `alipay.trade.fastpay.refund.query` 退款结果查询（用于处理「退款调用超时」的对账入口）
- 管理员独立账号体系（独立表、独立会话、环境变量种子）
- 管理页：订单列表/搜索、订单详情、主动查单、退款、用户元数据查询、补发/撤销 Pro、审计列表
- 用户端：支付返回后的状态轮询与成功/失败/退款文案
- `admin_audit` 审计表，所有权益变更必须留痕

### Out

- 支付宝对账单下载与自动对账（`bill.downloadurl`）
- `alipay.trade.close` 关单（本地已有 `closeOrder`，不接远端）
- 部分退款（V1 只支持整单全额退款）
- 多管理员角色/权限分级
- 查看或修改用户训练、饮食、身体数据（违背「不点上传就不上来」的产品承诺）
- 用户密码重置（无第二因子，不做）
- 用户冒充登录（impersonation）
- 定时查单任务（V1 用触发式：用户回跳 + 管理员手动）

## 4. 总体设计

### 4.1 新增模块

后端：

| 模块 | 职责 |
| --- | --- |
| `AdminAuthService` | 管理员登录/会话/种子账号，仿 `AccountService` 的 token 哈希方案 |
| `AdminController` | `/api/admin/auth/*`、`/api/admin/orders/*`、`/api/admin/users/*`、`/api/admin/audit` |
| `OrderSyncService` | 主动查单：调 `trade.query`、状态映射、金额校验、调 `deliverPaid` |
| `RefundService` | 退款：调 `trade.refund`、DB 闸门、权益扣减、审计 |
| `AdminAuditService` | 写审计（所有变更动作强制 reason） |

前端：

| 模块 | 职责 |
| --- | --- |
| `src/pages/AdminPage.jsx` | `#/admin` 路由：登录、订单、用户、审计四个视图 |
| `src/api/admin.js` | 独立 admin token（`fitplan.admin.token`），不混用用户 token |
| `AccountCard.jsx` 改造 | 支付返回后轮询 refresh，渲染成功/失败/已退款状态 |

### 4.2 两条关键链路

通知丢失补单：

```
支付宝已扣款但 notify 丢失
  → 订单停在 created
  → 用户回到设置页：POST /api/pay/order/refresh（限频）
    或 管理员在管理页点「查单」
  → OrderSyncService 调 alipay.trade.query
  → trade_status=TRADE_SUCCESS 且金额一致
  → deliverPaid()（与 notify 共用，DB 闸门幂等）
  → 用户 plan 加天数，管理动作写审计
```

退款：

```
管理员在订单详情点退款（必填原因，二次确认）
  → RefundService 校验：status=paid 且 refund_status=none
  → alipay.trade.refund（out_request_no = out_trade_no，全额）
  → 成功：事务内
       1) UPDATE orders SET refund_status='refunded' ... WHERE refund_status='none'
       2) 扣回本单 days 天：plan_expires_at = plan_expires_at - days
       3) 若 <= NOW()：plan='free'，plan_expires_at=NULL
       4) 写 admin_audit（before/after、原因）
  → 失败（超时/未知）：不扣权益，前端提示「结果未确认，可点退款查询」
```

## 5. 数据模型（DDL 草案，尚未执行）

### 5.1 `orders` 增列

```sql
ALTER TABLE orders
  ADD COLUMN buyer_id VARCHAR(64) NULL COMMENT '支付宝 buyer_id，notify/查单回来记下，只做对认人用',
  ADD COLUMN refund_status ENUM('none','refunded') NOT NULL DEFAULT 'none',
  ADD COLUMN refund_cent INT UNSIGNED NULL COMMENT '实际退款金额（分）',
  ADD COLUMN refunded_at DATETIME NULL,
  ADD COLUMN refund_request_no VARCHAR(64) NULL COMMENT '传给支付宝的 out_request_no，V1 等于 out_trade_no';
```

说明：`orders.days` 本身就是本单购买天数，退款按它扣，不额外存 `days_credited`。`status` 保持支付事实（created/paid/closed），退款是独立维度，避免把 `paid` 覆盖掉。

### 5.2 管理员三张表

```sql
CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  login_name VARCHAR(64) NOT NULL,
  password_hash VARCHAR(160) NOT NULL COMMENT 'PBKDF2-HMAC-SHA256，与用户密码同一套 PasswordHash',
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admin_login_name (login_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) NOT NULL,
  admin_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (token_hash),
  KEY idx_admin_sessions_admin (admin_id),
  CONSTRAINT fk_admin_sessions_admin FOREIGN KEY (admin_id) REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;

CREATE TABLE IF NOT EXISTS admin_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id BIGINT UNSIGNED NOT NULL,
  admin_login VARCHAR(64) NOT NULL COMMENT '快照，管理员被删也要认得出是谁',
  action VARCHAR(32) NOT NULL COMMENT 'sync_deliver / refund / grant / revoke',
  out_trade_no VARCHAR(40) NULL,
  target_user_id BIGINT UNSIGNED NULL,
  before_json JSON NULL COMMENT 'plan / plan_expires_at / order status',
  after_json JSON NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_audit_time (created_at),
  KEY idx_admin_audit_order (out_trade_no),
  KEY idx_admin_audit_user (target_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

约定：

- `admin_audit` **不建外键**，用户/管理员删除后审计仍保留。
- 迁移方式照现有习惯：`server/schema.sql` 追加建表语句；`SchemaInitializer` 学 `upgradeUsers()` 的模式补 `orders` 列（`information_schema` 判断，重复跑不动数据）。

## 6. 后端接口

### 6.1 用户侧（沿用现有鉴权）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/pay/order?out_trade_no=` | 响应扩展 `refundStatus`、`refundedAt`、`refundCent` |
| POST | `/api/pay/order/refresh` | 请求 `{outTradeNo}`；只允许查自己的订单；调 `trade.query` 兜底发货；每单 10 秒最多一次，超限回 429 |

`GET /api/pay/order` 保持只读，不做远端调用，避免被轮询打爆支付宝接口。

### 6.2 管理侧（统一前缀 `/api/admin`）

鉴权：除 `auth/login` 外一律要求 `Authorization: Bearer <admin token>`；**未认证/无此路由统一回 404**（不暴露管理端存在）。

| 方法 | 路径 | 请求 | 响应 |
| --- | --- | --- | --- |
| POST | `/auth/login` | `{loginName, password}` | `{token, expiresAt}`；失败 401 泛化文案；连错 8 次冷 15 分钟（复用 `LoginGuard`，key 前缀 `admin\|`） |
| POST | `/auth/logout` | — | `{}` |
| GET | `/me` | — | `{loginName, expiresAt}` |
| GET | `/orders?status=&q=&limit=&offset=` | q 匹配订单号/trade_no/登录名/uid 尾号 | `{items, total}`，limit 默认 50、最大 100 |
| GET | `/orders/{outTradeNo}` | — | 订单 + 用户元数据 + 该单审计记录 |
| POST | `/orders/{outTradeNo}/sync` | `{note?}` | `{changed, alipayStatus, verdict, plan}`；changed=true 时写审计 `sync_deliver` |
| POST | `/orders/{outTradeNo}/refund` | `{reason}`（2–200 字，必填） | `{refunded, refundCent, plan, refundedAt}` |
| GET | `/users?q=` | q 匹配登录名 / uid 尾号 | 仅元数据：id、login_name、uid 尾号、plan、expiresAt、createdAt、lastLoginAt、已付订单数 |
| POST | `/users/{id}/plan` | `{action:'grant'\|'revoke', days, reason}` | `{plan}`；days 1–365；写审计 |
| GET | `/audit?limit=&offset=` | — | `{items, total}`，按时间倒序 |

用户搜索结果**不包含** profiles/frameworks/set_logs/meal_logs 等任何内容表字段；实现层不允许调用这些表的查询方法。

### 6.3 错误约定

- 401：管理员登录失败（泛化「登录失败」）
- 404：`/api/admin/**` 未认证、订单/用户不存在、非管理员令牌访问
- 409：重复退款（`refund_status != 'none'`）、状态不允许
- 429：登录限流、refresh 限频
- 400：reason 缺失、days 越界
- 502/500：支付宝网关失败，消息透传 `AlipayException` 的 `sub_msg`

## 7. 关键逻辑

### 7.1 `AlipayClient` 扩展

复用现有私有 `exec(method, extra)`：

```java
public JsonNode tradeQuery(String outTradeNo);            // alipay.trade.query
public JsonNode tradeRefund(String outTradeNo, int amountCent,
                            String reason, String outRequestNo); // alipay.trade.refund
public JsonNode refundQuery(String outTradeNo, String outRequestNo); // alipay.trade.fastpay.refund.query
```

`biz_content` 用 `JsonUtil.MAPPER` 序列化后作为 `extra` 的一个字段传入；`exec` 已负责签名、发送、回执验签、错误码抛 `AlipayException`。

### 7.2 发货重构（notify 与查单共用）

`AccountService.fulfill(outTradeNo, tradeNo)` 改为 `deliverPaid(outTradeNo, tradeNo, buyerId, amountCent)`：

1. `UPDATE orders SET status='paid', paid_at=NOW(), trade_no=?, buyer_id=? WHERE out_trade_no=? AND status='created'`（命中 0 行即幂等返回 false）
2. 命中后按 `orders.days` 续加 `users.plan_expires_at`（逻辑与现 `fulfill` 相同）
3. 事务内完成

`PayController.notify` 与 `OrderSyncService` 都调用同一方法，杜绝两条发货路径行为漂移。

### 7.3 主动查单

1. 读取订单，校验归属（用户侧）或存在（管理侧）
2. 调 `trade.query`，读 `trade_status`、`total_amount`、`trade_no`、`buyer_id`
3. 金额比对：`total_amount` 换算为分，必须等于 `orders.amount_cent`；不等则**不发货**，返回 `verdict=mismatch`（管理页显红，写日志）
4. 状态映射：
   - `TRADE_SUCCESS` / `TRADE_FINISHED` → `deliverPaid`（幂等）
   - `TRADE_CLOSED` → `closeOrder`（本地闸门内）
   - `WAIT_BUYER_PAY` → 原样返回「买家未支付」
5. 限频：用户侧每单 10 秒一次（进程内 `ConcurrentHashMap`，参照 `LoginGuard` 的清理策略）；管理侧每单 3 秒一次
6. 返回 `{alipayStatus, changed, amountMatch, plan}`，管理页可见

### 7.4 退款（V1 只做全额）

前置条件：`status='paid'`、`refund_status='none'`、`trade_no` 非空、未超出支付宝退款期限。

- 调 `alipay.trade.refund`：`out_trade_no`、`refund_amount = amount_cent/100`（两位小数字符串）、`out_request_no = out_trade_no`、`refund_reason = reason`（截断 256 字符）
- 成功（code=10000 且 `fund_change=Y` 或 `refund_fee` 有值）后，单事务：
  1. 闸门：`UPDATE orders SET refund_status='refunded', refund_cent=?, refunded_at=NOW(), refund_request_no=? WHERE out_trade_no=? AND refund_status='none'`；命中 0 → 409
  2. 扣天：`UPDATE users SET plan_expires_at = DATE_SUB(plan_expires_at, INTERVAL ? DAY) WHERE id = ?`
  3. 到期归零：`UPDATE users SET plan='free', plan_expires_at=NULL WHERE id=? AND (plan_expires_at IS NULL OR plan_expires_at <= NOW())`
  4. 写审计 `refund`（before/after、金额、原因）
- 支付宝已退过（重复调用）：`out_request_no` 保证幂等；若网关返回「已全额退款」，查询 `refund.query` 后把本地状态补成 refunded，并写审计备注
- 网关超时/结果未知：**不动本地权益**，订单状态不变，管理页提示「退款结果未确认」，提供「退款查询」按钮（`refund.query`），确认后退款流程只做本地落库与权益扣减（不再重复调 refund）
- 部分退款：前端隐藏金额输入，服务端拒绝 `refund_amount != amount_cent`

扣天规则（明确写入验收）：退款扣的是**本单购买的天数**，从当前到期日往前扣；如果扣完已到期，降为 free。用户叠加购买多单时，退款哪单扣哪单的天数，不按「最后购买的天数」做 LIFO/FIFO 推断。

### 7.5 权益补发/撤销（不含订单）

- `grant`：days 1–365，直接从 `GREATEST(COALESCE(plan_expires_at, NOW()), NOW())` 加天数，`plan='pro'`
- `revoke`：days 1–365，从 `plan_expires_at` 扣，归零则 `plan='free'`、`expires=NULL`
- 两者都必须带 reason，写审计 `grant` / `revoke`
- 补发的第一选择仍是「查单」，grant 只用于订单缺失的线下补偿；管理页 UI 文案要写明这点

### 7.6 管理端鉴权

- 独立 `admin_users` / `admin_sessions`，**不**在 `users` 表加 role，不与用户令牌互通
- 登录密码：`PasswordHash`（PBKDF2 120k 次）；密码最短 12 位；无注册接口
- 种子：启动时若 `FITPLAN_ADMIN_LOGIN` + `FITPLAN_ADMIN_PASSWORD` 有值且该登录名不存在，则创建；**已存在不覆盖密码**（避免重启悄悄改密）；未配置则管理登录接口回 404
- 会话：随机 32 字节 token，只存 SHA-256；TTL 默认 12 小时（`FITPLAN_ADMIN_SESSION_HOURS`）；启动/每小时清理过期会话（复用 sweep 模式）
- 限流：`LoginGuard`，key = `admin|<loginName>|<remoteAddr>`
- 可选：`FITPLAN_ADMIN_IPS` 逗号白名单；启用后非白名单来源直接 404（注意反向代理需要取 `X-Forwarded-For` 的配置说明）
- `/api/health` 不暴露 admin 配置是否存在
- CORS 沿用现有 `CorsFilter` 白名单，不单独放开管理来源

### 7.7 用户侧支付反馈状态机（`AccountCard.jsx`）

状态：`idle → submitting → redirecting → pending → success | closed | failed | refunded`

- 从支付宝返回：读 `fitplan.order`，立即 `GET /api/pay/order` 一次；未 paid 则调 `POST /api/pay/order/refresh`，最多轮询 3 次、间隔 2 秒
- 成功：清 `fitplan.order`，显示「这一单到账了，Pro 到 X 月 X 日」，刷新 plan
- 仍 `created`：显示「支付结果还没回来，稍后会自动到账」+ 手动「再查一次」按钮（走 refresh）
- `closed`：显示「交易已关闭，没有扣款」
- `refunded`：显示「已退款到支付宝，Pro 权益已收回」；`plan` 显示免费版
- 网络失败：保持现有「连不上登录服务」文案，不重试无限循环

### 7.8 管理页 UI

- 路由：`#/admin`（不注册底部 Tab、用户界面无任何入口链接；安全靠服务端鉴权）
- 独立令牌：`localStorage['fitplan.admin.token']`，与用户令牌分离；退出登录只清这个键
- 视图：
  1. 登录（账号/密码）
  2. 订单：状态筛选（created/paid/closed/refunded）、搜索框、分页；行内显示订单号、用户、金额、状态、时间
  3. 订单详情：金额/天数/trade_no/buyer_id/时间线 + 审计记录 + 操作按钮「查单」「退款」「退款查询」
  4. 用户：搜索 → 元数据卡片 + 补发/撤销（原因必填、二次确认）
  5. 审计：只读列表（时间、管理员、动作、订单、用户、原因、before/after 折叠）
- 样式：复用现有 `.card` / `.btn` 与颜色变量，新增 `src/pages/admin.css`；桌面优先，表格 `overflow-x: auto`，手机可用
- 退款/补发确认弹层必须展示：目标用户、订单号、金额/天数、原因输入框

### 7.9 配置项

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `FITPLAN_ADMIN_LOGIN` | 空 | 种子管理员登录名；空 = 管理端关闭（404） |
| `FITPLAN_ADMIN_PASSWORD` | 空 | 种子密码，≥12 位；只在首次创建时使用 |
| `FITPLAN_ADMIN_SESSION_HOURS` | 12 | 管理会话 TTL |
| `FITPLAN_ADMIN_IPS` | 空 | 可选 IP 白名单，逗号分隔 |
| `ALIPAY_GATEWAY` | 生产网关 | 沙箱时改为 `https://openapi-sandbox.dl.alipaydev.com/gateway.do` |
| `FITPLAN_PUBLIC_BASE` | 空 | notify 公网地址；评审期必须稳定可达 |
| 现有 `ALIPAY_APP_ID` / 密钥 | — | 必须是报名账号下的应用（比赛硬性要求） |

## 8. 验收清单

沙箱必测（S）、真实小额必测（R，确认主办方「有效交易」口径后）：

| # | 场景 | 步骤 | 预期 |
| --- | --- | --- | --- |
| T1 (S) | 正常支付 | 沙箱付款 → notify | 订单 paid，plan 加 30 天，仅加一次 |
| T2 (S) | 通知丢失补单 | 阻断 notify，订单停在 created；管理页「查单」 | 订单 paid，plan 加一次；审计出现 `sync_deliver` |
| T3 (S) | 用户回跳兜底 | 同上，用户回到设置页自动 refresh | 轮询后显示成功；重复 refresh 不重复加天 |
| T4 (S) | 重复通知 | 连发 3 次相同 notify | 只发货一次；日志「重复通知，已忽略」 |
| T5 (S) | 金额不符 | 构造金额不一致的通知 | 不发货；回 failure；日志留原因 |
| T6 (S) | 全额退款 | 管理页退款（填原因） | 支付宝退款成功；订单 refunded；plan 扣回 30 天；审计一条 |
| T7 (S) | 重复退款 | 再点一次退款 | 409「已退款」；不重复扣天；不重复调支付宝 |
| T8 (S) | 叠加订单退款 | 两单各 30 天后退掉其中一单 | 只扣该单 30 天；另一单权益保留 |
| T9 (S) | 退款后到期 | 退掉后到期日已过 | 用户显示免费版 |
| T10 (S) | 越权 | 用户令牌调 `/api/admin/orders` | 404 |
| T11 (S) | 管理员限流 | 连错 8 次密码 | 第 9 次 429，15 分钟后恢复 |
| T12 (S) | 用户数据隔离 | 管理端用户搜索结果 | 只含元数据，无任何训练/饮食字段 |
| T13 (S) | 刷新限频 | 10 秒内连续 refresh | 429，不落支付宝调用 |
| T14 (S) | 前端反馈 | 支付返回/失败/关闭/退款 | 四种文案与 plan 展示正确 |
| T15 (R) | 真实交易 | 自己/朋友真实支付一笔（非刷单） | 主办方后台能统计到该用户；确认退款是否影响计数 |

另外做一次「反向验证」：把 notify 路由临时指向 404（或断网），走 T2 全流程，证明不依赖通知也能交付。

## 9. 里程碑（不含用户侧 P0）

| 里程碑 | 内容 | 预估 |
| --- | --- | --- |
| M0（用户侧，先行） | aipay 开通网页应用收款；确认报名账号 = `ALIPAY_APP_ID` 账号；稳定公网部署 | 11/19–11/24 |
| M1 | `orders` 增列、admin 三表、种子与管理员登录、审计骨架 | 0.5–1 天 |
| M2 | `AlipayClient` 三个新方法、`deliverPaid` 重构、管理侧 sync、用户侧 refresh | 1 天 |
| M3 | 退款 + 权益扣减 + 审计 + 用户侧反馈状态机 | 1 天 |
| M4 | 管理页四个视图 + 联调 | 1–1.5 天 |
| M5 | 验收清单全跑、演示脚本、清理测试数据 | 0.5 天 |

开发合计约 4–5 天，需在 12/9 前留出至少 3 天 buffer 做真实交易和社区运营。

## 10. 风险与开放问题

1. **有效交易口径**：退款是否从「有效交易」中剔除？需在官方企业微信群确认（影响 T15 演示策略：退款演示是否用另一单）。
2. **aipay 开通资格**：个人开发者「定向开放」；规则给的第二条路是 AI付接入 Skill 会话开通，需先验证能否走通。
3. **账号一致性**：报名账号与 `ALIPAY_APP_ID` 所属账号不一致会失去资格校验，必须先核对。
4. **稳定部署**：cloudflared 临时隧道每次换域名，评审期 15 天不可接受；需要固定域名或小服务器。
5. **支付宝接口权限**：`trade.query` / `trade.refund` 是否需要额外签约；沙箱通常可用，生产要确认。
6. **管理页暴露面**：强密码 + 限流 + 可选 IP 白名单；上线前不把 `#/admin` 写进任何公开页面。
7. **Pro 权益门槛（已实现 2026-11-19）**：云端同步的上传与拉回要求有效期内的 Pro（402），删除云端那份不设门槛；设置页对免费/过期用户锁定两个按钮并给升级入口。
8. **退款扣天规则**对叠加订单的语义已在 7.4 明确，答辩时要能讲清。

## 11. 本稿已定的决策

| 决策点 | 结论 | 理由 |
| --- | --- | --- |
| 管理员建模 | 独立 `admin_users` / 独立会话 | 不与用户登录共用攻击面；用户表保持干净 |
| 退款状态 | `orders.refund_status` 独立列，不改 `status` | 保留支付事实，便于对账与审计 |
| 退款范围 | V1 仅全额退款 | 部分退款 + 权益扣减语义复杂，比赛不需要 |
| 查单触发 | 用户回跳触发（限频）+ 管理员手动 | 不做定时任务，避免复杂度和接口高频调用 |
| 管理页位置 | 同一 SPA `#/admin`，独立令牌 | 复用构建与样式，入口不暴露 |
| 审计表 | 无外键 + 管理员登录名快照 | 用户/管理员删除后审计必须仍可读 |
| Pro 权益 | 云端上传/拉回需要有效期内的 Pro；删除云端那份不设门槛 | 付费点与「跨设备备份」自然衔接，同时保留用户随时删除自己数据的权利 |
| 补发优先级 | 优先「查单」，grant 只用于订单缺失 | 补发必须能关联真实交易，审计可解释 |

## 12. 不做的事（复述）

对账下载、远端关单、部分退款、多角色、用户内容访问、密码重置、定时任务、后台数据大屏。