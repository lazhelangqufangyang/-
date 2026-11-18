# 练

移动端优先的健身计划 PWA：把「想练成什么样」翻成一份周框架，每天生成一张按顺序往下做的清单，逐组记重量和次数，重量按你自己的记录往上推。

在线地址：<https://minute-fitplan-9u7zherxrt7.qoder.zone/>

## 里面有什么

- **建档两问**：身体数据、想练成什么样，都能跳过，也可以一句「先不设目标，自由练」。训练日不问：默认周一到周四，练哪天自己在那个页面上挪。
- **新手不用先懂分化**：没系统练过的人直接拿到一套四练三分化（周一 胸+三头 / 周二 背+二头 / 周三 腿+臀 / 周四 肩+手臂），一次四个动作、每个 3 组 10–15 次，前两周重量按周计划不动，第三周起做满次数才加。
- **周框架自己点**：哪天练、那天练哪个部位由你决定，组数 / 次数 / 重量由本机规则按你的器械条件、伤病记录和逐组历史算，排课不请求任何模型。动作记过一次之后，重量就只按你自己的记录往上推，不再用估算值。
- **动作库 109 个**：按部位分区，每个动作有本机画的 SVG 动作示意、发力顺序、常见错误和同肌群替代动作。44 个动作预置了示范视频链接，指向 [谭成义](https://space.bilibili.com/521903482) 本人的 B 站与抖音页面 —— 只放链接，不复制、不内嵌。
- **逐组记录**：记每一组的重量和次数，可选 RPE；能加一组、删一组、给某个动作挂递减组（按档记重量和组数）、拖卡片改顺序，不想练的那一行直接从天里拿掉。
- **身体数据打卡**（在「记录」里）：每天称一次体重、隔几周量一次腰围，记下来就有折线和周变化。判断按最近两个 7 天平均相减，不按某一天说话；走势对着你目标的节奏（减脂一周 0.5–1%，超过 1% 就提醒你别再砍热量），还能一键把最新一次称重更新进档案，热量参考跟着走。
- **饮食**：按 Mifflin-St Jeor 估基础代谢再乘活动系数给一日热量参考，另有蛋白 / 碳水 / 脂肪 / 糖 / 钠五项区间、65 条常见食物营养表、按档案算出的三份主食方案。
- **离线可用**：可以添加到主屏幕，断网能看档案、翻清单、记组数。

## 数据放在哪

默认全部留在这台设备的浏览器 `localStorage`（键名 `fitplan.v1`）：档案、周框架、训练记录、饮食记录、打卡、体重腰围、示范视频链接。可以在「设置 → 数据与备份」导出成一份 JSON 自己留着，也能导回来。清空浏览器数据就没了，所以导出是唯一的保底。

登录是可选的，两种登录方式都支持：**账号密码**（本机起了后端就能注册，不需要任何第三方应用）和**支付宝授权**（要在开放平台建应用）。云端那张 `users` 表只有账号名或支付宝 uid 的后四位、订阅状态和会话；训练和饮食的内容不点「传到云端」就一个字节都不上来，点了也是按账号存一份整档，随时能删，注销账号连着一起删。口令只存 PBKDF2-HMAC-SHA256 的散列，明文不落库，忘了找不回来。

大模型 Key 由使用者自己填，明文存在本机浏览器里，不上传 —— 共用设备上不要填。

## 跑起来

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # 产物在 dist/
npm run preview   # http://localhost:8082
```

需要 Node 20 以上。

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/` | 前端入口：`main.jsx`（挂载）、`App.jsx`（哈希路由 + 底部五个 Tab）、`store.js`（本机存档） |
| `src/pages/` | 一级页面，一个页面一个文件：`TrainingPage`（运动）、`SessionPage`（执行）、`RecordPage`（记录）、`MovesPage`（动作）、`DietPage`（饮食）、`ProfilePage` / `SettingsPage`（个人）、`PlanPage`（选部位出表）、`PickPage`（挑动作）、`WelcomePage` / `OnboardingPage` / `SplashPage` |
| `src/components/` | 页面里复用的组件：`Timeline`、`MoveDetail`、`MoveAnim`、`Ruler`、`EffortSlider`、`MatchaPowderReveal`、`AccountCard`、`PersonalRecord`，以及 `profile/` 下的底部弹层与账号设置 |
| `src/engine/` | 排课、重量推算、记录汇总、饮食估算、体重腰围走势，全部是纯函数 |
| `src/api/` | 后端接口：登录令牌、会话、训练记录同步 |
| `src/videoSeed.js` | 动作 → 示范视频链接 |
| `qa/` | 46 组场景、273 条断言，跑的是 `src/engine/` |
| `server/schema.sql` | 云端十张表的 DDL |
| `backend/` | Spring Boot 3.2.11 / Java 17 的登录、备份、收款接口 |

## 测试

```bash
node node_modules/rolldown/bin/cli.mjs qa/engine-test.js --format esm -o qa/out.mjs && node qa/out.mjs
```

## 后端（可选）

前端默认请求同源的 `/api`，不跑后端也能用；没连上时登录和云端备份那几处会直接说连不上，本机记录不受影响。

```bash
# 1. 建库
mysql -u root -p -e "CREATE DATABASE fitplan DEFAULT CHARSET utf8mb4"

# 2. 配凭据
cp server/.env.example server/.env   # 填 MySQL 口令；server/.env 已在 .gitignore 里

# 3. 起服务（默认 8787，和 vite.config.js 的代理目标一致）
npm run api:build
npm run api
```

支付宝授权登录和收款要在开放平台建应用，把 `ALIPAY_APP_ID`、应用私钥、支付宝公钥填进环境变量，`FITPLAN_PUBLIC_BASE` 必须是支付宝服务器打得到的公网地址，否则收不到异步通知。没配支付宝也不影响登录：账号密码那一套是独立的。

`/api/health` 默认只回 `db` / `alipay` / `pay` 三个状态，缺哪些环境变量、CORS 白名单里有谁都不写在回应里 —— 挂着公网时这是给陌生人看的。自己排查时把 `FITPLAN_HEALTH_DETAIL=1` 打开再访问就有全部细节。

## 云端备份的覆盖保护

「传到云端」是整份覆盖，所以每次上传会带上本机上一次看到的云端时间戳（存在 `localStorage` 的 `fitplan.cloud`）。后端发现库里那份比这个时间新，就回 409 不写，界面上会问一句「先拉回来看看，还是确定用本机这份覆盖」—— 另一台设备刚传过东西的时候，这一句就是防你把别人的记录盖掉。

## 账号密码登录

后端起来就有这两个接口，不需要任何第三方应用：

```bash
curl -X POST localhost:8787/api/auth/register -H 'Content-Type: application/json' \
  -d '{"loginName":"lin_01","password":"xxxxxxxx"}'      # 换成 /api/auth/login 就是登录
```

回 `{token, kind, handle, plan}`，前端把 token 存进 `localStorage` 之后的会话接口都靠它。约束：账号名 3–32 个字符（存的时候统一小写），口令 8–64 位且不能全是数字；同一个「账号名 + 来源地址」连错 8 次冷十五分钟。库里存的是 `PBKDF2-HMAC-SHA256`（12 万次迭代、16 字节随机盐）的散列，不是明文也不是可逆加密。

## 让线上站点也能登录（内网穿透）

线上那份站点是纯静态的，同源没有 `/api`。要把本机后端挂出去，先起隧道：

```bash
npm run api                                   # 本机 8787
npm run tunnel                                # 打印一个 https://xxxx.trycloudflare.com 的公网地址
```

然后在「设置 → 数据与备份 → 后端地址」里填上 `https://xxxx.trycloudflare.com/api` 保存，全站立刻走这个地址；点「用同源」就退回本机没后端的状态。支付宝的异步通知也要打这个地址，所以收款时还得把它写进 `FITPLAN_PUBLIC_BASE` 再重启后端。

隧道每次启动换一个域名，而且本机服务一关线上就断 —— 这条链路适合联调和演示，不适合长期给陌生用户用。
