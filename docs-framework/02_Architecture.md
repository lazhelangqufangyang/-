# 02 · 架构设计

> 技术栈与模块边界是本项目的架构契约。未经明确批准，不得引入表外框架或改变分层职责。

## 1. 架构总览

```text
浏览器（React SPA + PWA）
        │  fetch /api（同源，开发期 Vite 代理）
        ▼
Spring Boot API（8787，无状态）
        ├─ Spring Security + JWT 过滤器
        ├─ 认证模块 auth/（注册、登录、改密、快捷登录）
        ├─ 管理模块 admin/（账号、VIP、订单、审计）
        ├─ 业务模块 web/ + service/（记录、支付、支付宝、会话）
        ├─ MySQL 8（业务数据、账号、订单、日志）
        ├─ Redis（JWT 黑名单、登录/注册限流）
        ├─ 支付宝开放平台（OAuth、支付、退款、关单）
        └─ 用户自填 OpenAI 兼容接口（浏览器直连，后端不代理）
```

部署形态：前端静态资源由 Nginx 托管并反代 `/api`；后端独立 JVM 进程；MySQL 与 Redis 独立部署。

## 2. 技术栈锁定

| 层 | 选型 | 版本 |
|---|---|---|
| 前端 | React + React DOM | 19.3.0 |
| 前端构建 | Vite + @vitejs/plugin-react | 8.3.4 / 6.1.2 |
| 前端语言 | JavaScript + JSX（`jsconfig.json`） | — |
| 样式 | 单文件手写 CSS | — |
| 路由 | 自研 hash 路由 | — |
| 状态 | React Hooks + localStorage | — |
| 请求 | 原生 fetch | — |
| 后端 | Java | 17 |
| 后端框架 | Spring Boot | 3.3.5 |
| 安全 | Spring Security 6 + JJWT | 6.x / 0.12.6 |
| 持久层 | MyBatis-Plus（认证）、JdbcTemplate（记录/支付） | 3.5.7 |
| 数据库 | MySQL | 8.x |
| 缓存 | Redis + StringRedisTemplate | 5.0+（生产建议 7.x） |
| 校验 | spring-boot-starter-validation | 随 Boot |
| 工具 | Hutool 5.8.32、Lombok 1.18.34 | — |
| 接口文档 | SpringDoc OpenAPI | 2.6.0 |
| 构建 | Maven | 3.9+ |

**禁止**：未经确认引入第二套 ORM、UI 框架、状态管理库、请求库或新的鉴权方案。

## 3. 分层与模块职责

### 3.1 后端

```text
backend/src/main/java/com/fitplan
├─ FitplanApiApplication.java   # 启动入口，先加载 server/.env
├─ auth/                        # 认证域
│  ├─ common/                   # Result、错误码、AuthException、IP 解析
│  ├─ config/                   # SecurityConfig、MyBatis-Plus、OpenAPI
│  ├─ dto/ entity/ mapper/      # 请求响应、SysUser、Mapper
│  ├─ security/                 # JwtService、过滤器、黑名单、限流、CurrentUser
│  └─ web/                      # /api/v1/auth/**
├─ admin/                       # 管理域
│  ├─ dto/ entity/ mapper/      # 分页、账号/订单/日志视图、OperationLog
│  ├─ service/                  # AdminService、AuditService
│  ├─ web/                      # /api/v1/admin/**
│  └─ AdminBootstrap.java       # 初始管理员
├─ config/                      # 属性、CORS、异常、建表、迁移、DotEnv
├─ service/                     # 账号、支付、支付宝、记录、JSON
└─ web/                         # 支付宝授权、会话、套餐、支付、数据、健康
```

| 层 | 职责 | 红线 |
|---|---|---|
| Controller | 接参、`@Valid` 校验、取当前用户、调 Service | 不写业务逻辑；返回值统一 `Result<T>` |
| Service | 业务规则、事务、审计 | 不直接拼复杂 SQL；多表写加事务 |
| Mapper / JdbcTemplate | 数据访问 | 复杂 SQL 写 XML 或常量 SQL，禁止字符串拼接用户输入 |
| Entity / DTO | 数据载体 | 字段与 `server/schema.sql` 一致 |

### 3.2 前端

```text
frontend/src
├─ main.jsx            # 入口，生产环境注册 Service Worker
├─ App.jsx             # hash 路由、登录门槛、档案门槛、TabBar
├─ pages/              # 欢迎、建档、运动、计划、训练、动作、记录、饮食、设置、后台
├─ components/         # ui.jsx 通用组件、ProfileForm
├─ lib/                # storage、api、plan、nutrition、ai、audit、exercises
├─ data/               # exercises.json、foods.json
└─ styles.css          # 手写样式
```

- 页面只负责展示与交互，算法放 `lib/`，请求统一走 `lib/api.js`。
- 业务数据键 `fitplan.v1`、令牌键 `fitplan.token` 等不改名，保证老数据兼容。

## 4. 关键设计决策

| 决策 | 原因 | 约束 |
|---|---|---|
| JWT 无状态认证 | 前后端分离、多设备 | 默认 2h；登出/改密写 Redis 黑名单 |
| Redis 承担黑名单与限流 | 跨实例一致、带 TTL | Redis 故障时 fail-open，限流退回内存 |
| MyBatis-Plus + JdbcTemplate 并存 | 认证 CRUD 简单、记录/支付以批量和条件更新为主 | 新代码按模块归属选择，不重复实现 |
| `SchemaInitializer` + `SchemaMigrator` | 本地零手工建库，已有库幂等升级 | 只做 `CREATE TABLE IF NOT EXISTS` 与加列，不删数据 |
| 本地优先 + 手动整份同步 | 隐私与实现简单 | 不做字段级合并与冲突处理 |
| 管理操作审计 | 可追溯 | `operation_log` 只追加，不设外键，不随用户删除 |
| 快捷登录受环境变量控制 | 便于本地验证 | `DEMO_LOGIN_ENABLED` 默认 false，生产必须关闭 |
| 支付宝真实退款 | 避免“假退款” | 未配置凭据时拒绝，不做本地标记退款 |

## 5. 环境矩阵

| 项目 | dev | test | prod |
|---|---|---|---|
| 前端 | Vite 5173，代理 `/api` | 构建产物 + 测试域名 | Nginx 静态 + `/api` 反代 |
| 后端 | `mvn spring-boot:run` 8787 | 独立 jar + 测试库 | jar + 生产库，JVM 参数外置 |
| MySQL | 本机 3306 / `fitplan` | 独立库 `fitplan_test` | 生产实例，强口令 |
| Redis | 本机 6379 | 测试实例 | 生产实例，可降级 |
| 密钥 | `server/.env` | CI 注入 | 密钥管理/环境变量 |
| 体验登录 | 可开启 | 可开启 | 必须关闭 |
| 日志 | 控制台 | 文件归档 | 文件 + 采集 |

## 6. 外部集成

- **支付宝 OAuth**：`/api/auth/alipay/start` 生成 state → 回调校验 → `user_id` 落库 → 签发 JWT → `#token=` 跳回。
- **支付宝支付**：手机 `alipay.trade.wap.pay`、桌面 `alipay.trade.page.pay`；异步通知验签 + app_id + 金额 + 状态，条件更新幂等发货。
- **退款/关单**：`alipay.trade.refund`、`alipay.trade.close`，仅管理员触发。
- **大模型**：OpenAI 兼容 `/chat/completions`，浏览器直连，Key 存 localStorage，后端不代理不落库。

## 7. 非功能落实

| 要求 | 实现 |
|---|---|
| 鉴权 | Security 过滤器逐请求校验 JWT，查询账号状态；停用立即失效 |
| 参数校验 | DTO `@NotBlank/@Size/@AssertTrue`，统一异常处理 |
| 错误格式 | 认证/管理 `{code,message,data}`；记录/支付 `{error}` |
| 日志 | Slf4j，禁止 `System.out.println`、空 catch |
| 事务 | 注册、发货、退款等多表写加事务 |
| 安全头 | CORS 白名单、OPTIONS 白名单、无状态会话 |
| 可观测 | `/api/health` 返回 db/alipay/pay/origins；SpringDoc 在线文档 |

## 8. 架构红线

1. 不引入未登记的第三方框架或工具库。
2. 不在 Controller 写业务逻辑，不在 Service 拼接原始 SQL。
3. 不修改 `server/schema.sql` 与 `docs-framework/03_Database.md` 中只改一侧。
4. 不关闭管理接口的 ADMIN 校验，不绕过 `@Transactional`。
5. 不在生产启用 `DEMO_LOGIN_ENABLED`。
