-- 这个文件是云端全部的表：认人、会话、登录跳转用的一次性 state、订单，以及登录用户的记录（profiles 往下那七张）。
-- 训练逐组记录、体重、饮食、伤病情报要不要进云端，由用户在「数据与备份」里点「传到云端」决定，不点就一个字节都不上来。
-- 跑一次：mysql -u 用户 -p 库名 < server/schema.sql；后端起来也会自己跑一遍。
-- 建表语句都是 IF NOT EXISTS，反复跑不动已有数据；users 上缺的列由 SchemaInitializer 补。

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  alipay_uid VARCHAR(64) NULL COMMENT '支付宝 user_id，只用来认人，页面只显示后四位；账号密码注册的账号这一列空着',
  login_name VARCHAR(64) NULL COMMENT '账号密码注册的登录名，全库唯一，存的时候统一小写',
  password_hash VARCHAR(160) NULL COMMENT 'PBKDF2-HMAC-SHA256 的散列（带迭代数和盐），口令本身不落库',
  plan ENUM('free','pro') NOT NULL DEFAULT 'free',
  plan_expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_alipay_uid (alipay_uid),
  UNIQUE KEY uk_users_login_name (login_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) NOT NULL COMMENT 'sha256(会话令牌) 的十六进制；令牌本身不落库',
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (token_hash),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;

CREATE TABLE IF NOT EXISTS oauth_states (
  state CHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (state),
  KEY idx_oauth_states_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;

-- 订单：金额按「分」存，对账时只认这个整数，不认前端回传的任何数。
-- 发货靠支付宝的异步通知，status 从 created 走到 paid 只有一次机会（WHERE status='created'）。
-- 退款是独立维度：status 保留支付事实，refund_status 单独记退款，避免把 paid 覆盖掉。
CREATE TABLE IF NOT EXISTS orders (
  out_trade_no VARCHAR(40) NOT NULL COMMENT '本机生成的订单号，支付宝原样带回',
  user_id BIGINT UNSIGNED NOT NULL,
  plan ENUM('pro') NOT NULL DEFAULT 'pro',
  days SMALLINT UNSIGNED NOT NULL COMMENT '这一单加多少天，发货时按这个数加',
  amount_cent INT UNSIGNED NOT NULL COMMENT '成交价（分）：通知里的 total_amount 必须等于它',
  status ENUM('created','paid','closed') NOT NULL DEFAULT 'created',
  trade_no VARCHAR(64) NULL COMMENT '支付宝交易号，退款和对账要用',
  buyer_id VARCHAR(64) NULL COMMENT '支付宝 buyer_id，通知或查单回来记下，只做对认人',
  refund_status ENUM('none','refunded') NOT NULL DEFAULT 'none',
  refund_cent INT UNSIGNED NULL COMMENT '实际退款金额（分）',
  refunded_at DATETIME NULL,
  refund_request_no VARCHAR(64) NULL COMMENT '传给支付宝的 out_request_no，全额退款时等于订单号',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  PRIMARY KEY (out_trade_no),
  KEY idx_orders_user (user_id),
  KEY idx_orders_status (status, created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 管理员：和用户完全是两套账号、两套会话，不在 users 上加角色列。
-- 账号只在后端启动时从环境变量种子一次，没有注册接口；口令与用户同一套 PBKDF2 散列。
CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  login_name VARCHAR(64) NOT NULL,
  password_hash VARCHAR(160) NOT NULL,
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admin_login_name (login_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) NOT NULL COMMENT 'sha256(管理员会话令牌) 的十六进制；令牌本身不落库',
  admin_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (token_hash),
  KEY idx_admin_sessions_admin (admin_id),
  CONSTRAINT fk_admin_sessions_admin FOREIGN KEY (admin_id) REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;

-- 审计：每一次权益变更都要能回答「谁、何时、对谁、改了什么、为什么」。
-- 故意不建外键：用户或管理员被删之后，这条记录仍然要读得懂，所以存 admin_login 快照。
CREATE TABLE IF NOT EXISTS admin_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id BIGINT UNSIGNED NOT NULL,
  admin_login VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL COMMENT 'sync_deliver / refund / grant / revoke',
  out_trade_no VARCHAR(40) NULL,
  target_user_id BIGINT UNSIGNED NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_audit_time (created_at),
  KEY idx_admin_audit_order (out_trade_no),
  KEY idx_admin_audit_user (target_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 往下的表是一个登录用户的记录。删掉账号（/api/account）会顺着外键把这里全清掉。
-- 大模型 Key、以及「今天手动点了哪些动作」这种一次性的界面状态不在这里，它们只留本机。
-- 日期和打卡时间按客户端原样存成字符串（YYYY-MM-DD / ISO）：DATETIME 会按时区换算，
-- 跨时区取回能把一条 11 月 6 日的记录挪成 11 月 5 日，逐日统计就跟着错了。
-- uploaded_at 是服务器时钟，只用来回答「这份是什么时候传上来的」。

-- 档案：单个问题一个列，只有成套的结构（伤病、目标、周几）才整团存 JSON
CREATE TABLE IF NOT EXISTS profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  sex ENUM('male','female') NULL,
  age TINYINT UNSIGNED NULL,
  height_cm DECIMAL(4,1) NULL,
  weight_kg DECIMAL(5,2) NULL,
  body_fat_pct DECIMAL(4,1) NULL,
  experience_years DECIMAL(4,1) NULL,
  last_solid_block CHAR(10) NULL COMMENT '上次认真练完一轮的日期',
  injuries JSON NULL,
  injuries_answered TINYINT(1) NOT NULL DEFAULT 0,
  commercial_gym TINYINT(1) NULL,
  extra_equipment VARCHAR(500) NULL,
  weekdays JSON NULL COMMENT '一周练哪几天，0=周日',
  session_minutes SMALLINT UNSIGNED NULL,
  goal_wish VARCHAR(1000) NULL,
  goal JSON NULL COMMENT '目标那一整块：分类键、优先部位、力量目标、每周检查项',
  sleep_hours DECIMAL(3,1) NULL,
  daily_steps SMALLINT UNSIGNED NULL,
  diet_restrictions VARCHAR(500) NULL,
  no_cardio TINYINT(1) NOT NULL DEFAULT 0,
  home_only TINYINT(1) NOT NULL DEFAULT 0,
  avoid_names JSON NULL,
  day_areas JSON NULL COMMENT 'weekday → 部位名',
  onboarded TINYINT(1) NOT NULL DEFAULT 0,
  favorites JSON NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 周框架：引擎按目标排出来的一整轮，当前只留最新一版
CREATE TABLE IF NOT EXISTS frameworks (
  user_id BIGINT UNSIGNED NOT NULL,
  framework_id VARCHAR(40) NOT NULL,
  start_date CHAR(10) NOT NULL,
  created_ts CHAR(32) NOT NULL,
  weeks_total TINYINT UNSIGNED NOT NULL,
  days JSON NOT NULL COMMENT '一周七天各自的动作顺序和分项时长',
  weeks JSON NOT NULL COMMENT '逐周的推进意图和 RPE 基线',
  rules JSON NOT NULL,
  goal JSON NOT NULL,
  assumed JSON NOT NULL COMMENT '用户没说、按默认补的项目',
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_frameworks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 今日表：引擎一天算出来的一张， slots/overrides 是这张表的内部结构，拆成行没有查询价值
CREATE TABLE IF NOT EXISTS day_sheets (
  user_id BIGINT UNSIGNED NOT NULL,
  sheet_id VARCHAR(40) NOT NULL,
  day_date CHAR(10) NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  focus VARCHAR(40) NOT NULL,
  budget_minutes SMALLINT UNSIGNED NOT NULL,
  load_adjust_pct DECIMAL(6,2) NOT NULL DEFAULT 0,
  input JSON NOT NULL,
  slots JSON NOT NULL,
  overrides JSON NOT NULL,
  skipped JSON NOT NULL,
  assumed JSON NOT NULL,
  flags JSON NOT NULL,
  dropped JSON NOT NULL,
  created_ts CHAR(32) NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sheet_id),
  KEY idx_sheets_user_date (user_id, day_date),
  CONSTRAINT fk_sheets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 逐组记录：哪张表的哪一行第几组，这三样加起来才是一条
CREATE TABLE IF NOT EXISTS set_logs (
  user_id BIGINT UNSIGNED NOT NULL,
  sheet_id VARCHAR(40) NOT NULL,
  slot_id VARCHAR(48) NOT NULL,
  set_idx SMALLINT UNSIGNED NOT NULL,
  ex_id VARCHAR(48) NOT NULL,
  day_date CHAR(10) NOT NULL,
  weight_kg DECIMAL(6,2) NULL,
  reps SMALLINT UNSIGNED NOT NULL,
  target_reps SMALLINT UNSIGNED NOT NULL,
  rpe DECIMAL(3,1) NULL,
  to_failure TINYINT(1) NOT NULL DEFAULT 0,
  done_ts CHAR(32) NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sheet_id, slot_id, set_idx),
  KEY idx_set_logs_user_date (user_id, day_date),
  KEY idx_set_logs_ex (user_id, ex_id, day_date),
  CONSTRAINT fk_set_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 没走执行表的运动：外面跑了 40 分钟、打了场球
CREATE TABLE IF NOT EXISTS activity_logs (
  user_id BIGINT UNSIGNED NOT NULL,
  log_id VARCHAR(40) NOT NULL,
  day_date CHAR(10) NOT NULL,
  name VARCHAR(500) NOT NULL,
  minutes SMALLINT UNSIGNED NOT NULL,
  kind ENUM('cardio','sport','lift','walk','other') NOT NULL,
  feel TINYINT NULL COMMENT '练完的状态，1 很差 5 很好，NULL 是当时没填',
  areas JSON NOT NULL,
  ex_ids JSON NOT NULL,
  note VARCHAR(1000) NULL,
  logged_ts CHAR(32) NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, log_id),
  KEY idx_activity_user_date (user_id, day_date),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 一餐一条。热量和各类营养素是用户自己估的，空着就是没估，不能补 0
CREATE TABLE IF NOT EXISTS meal_logs (
  user_id BIGINT UNSIGNED NOT NULL,
  log_id VARCHAR(40) NOT NULL,
  day_date CHAR(10) NOT NULL,
  slot ENUM('breakfast','lunch','dinner','snack') NOT NULL,
  name VARCHAR(500) NOT NULL,
  kcal MEDIUMINT UNSIGNED NULL,
  protein_g DECIMAL(7,1) NULL,
  carbs_g DECIMAL(7,1) NULL,
  fat_g DECIMAL(7,1) NULL,
  sugar_g DECIMAL(7,1) NULL,
  sodium_mg INT UNSIGNED NULL,
  fiber_g DECIMAL(7,1) NULL COMMENT '膳食纤维，每份粗值',
  calcium_mg DECIMAL(8,1) NULL,
  iron_mg DECIMAL(6,1) NULL,
  potassium_mg DECIMAL(8,1) NULL,
  vitamin_d_mcg DECIMAL(7,1) NULL,
  vitamin_b12_mcg DECIMAL(7,1) NULL,
  magnesium_mg DECIMAL(8,1) NULL,
  note VARCHAR(1000) NULL,
  logged_ts CHAR(32) NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, log_id),
  KEY idx_meal_user_date (user_id, day_date),
  CONSTRAINT fk_meal_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS measure_logs (
  user_id BIGINT UNSIGNED NOT NULL,
  log_id VARCHAR(40) NOT NULL,
  day_date CHAR(10) NOT NULL,
  weight_kg DECIMAL(5,2) NULL,
  waist_cm DECIMAL(4,1) NULL,
  note VARCHAR(1000) NULL,
  logged_ts CHAR(32) NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, log_id),
  KEY idx_measure_user_date (user_id, day_date),
  CONSTRAINT fk_measure_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
