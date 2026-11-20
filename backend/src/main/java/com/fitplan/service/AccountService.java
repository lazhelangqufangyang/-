package com.fitplan.service;

import com.fitplan.config.ApiException;
import com.fitplan.config.FitplanProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 认人、会话、订单这些表的读写。令牌只存哈希：库被翻出来也拿不到能用的会话。 */
@Service
public class AccountService {

    private static final Logger log = LoggerFactory.getLogger(AccountService.class);
    private static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");
    private static final SecureRandom RANDOM = new SecureRandom();
    /** 页面上只回后四位，全量 uid 不出后端 */
    private static final int TAIL_LENGTH = 4;

    private final JdbcTemplate jdbc;
    private final FitplanProperties props;

    public AccountService(JdbcTemplate jdbc, FitplanProperties props) {
        this.jdbc = jdbc;
        this.props = props;
    }

    public boolean dbUp() {
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public void putState(String state) {
        jdbc.update("INSERT INTO oauth_states (state) VALUES (?)", state);
    }

    /** 到期的会话、放凉的 state 不在库里堆着：服务起来跑一次，之后每小时一次。 */
    public Map<String, Object> purgeExpired() {
        int sessions = jdbc.update("DELETE FROM sessions WHERE expires_at <= NOW()");
        int states = jdbc.update("DELETE FROM oauth_states WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sessions", sessions);
        out.put("states", states);
        return out;
    }

    /** 一次性：取到就删，顺带把两边过期的东西清掉。 */
    public boolean takeState(String state) {
        List<String> rows = jdbc.queryForList("SELECT state FROM oauth_states WHERE state = ? LIMIT 1", String.class, state);
        jdbc.update("DELETE FROM oauth_states WHERE state = ?", state);
        purgeExpired();
        return !rows.isEmpty();
    }

    public long upsertUser(String alipayUid) {
        jdbc.update(
            "INSERT INTO users (alipay_uid, last_login_at) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE last_login_at = NOW()",
            alipayUid);
        Long id = jdbc.queryForObject("SELECT id FROM users WHERE alipay_uid = ? LIMIT 1", Long.class, alipayUid);
        if (id == null) {
            throw new IllegalStateException("刚写进去的用户读不回来：" + alipayUid);
        }
        return id;
    }

    /** 账号密码注册：登录名已被占用就回 409，别把 MySQL 的重键错误原样抛给前端。 */
    public long createPasswordUser(String loginName, String passwordHash) {
        if (passwordUserRow(loginName) != null) {
            throw new ApiException(409, "这个账号名已经有人用了，换一个。");
        }
        try {
            jdbc.update("INSERT INTO users (login_name, password_hash, last_login_at) VALUES (?, ?, NOW())",
                loginName, passwordHash);
        } catch (DataAccessException e) {
            // 两个人同时抢同一个名字的窗口很窄，但重键约束说了话就照它回
            throw new ApiException(409, "这个账号名已经有人用了，换一个。");
        }
        Long id = jdbc.queryForObject("SELECT id FROM users WHERE login_name = ? LIMIT 1", Long.class, loginName);
        if (id == null) {
            throw new IllegalStateException("刚写进去的账号读不回来：" + loginName);
        }
        return id;
    }

    /** 连口令散列一起取回来，交给 PasswordHash.matches 判；查不到返回 null */
    public Map<String, Object> passwordUser(String loginName) {
        return passwordUserRow(loginName);
    }

    private Map<String, Object> passwordUserRow(String loginName) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT id, alipay_uid, login_name, password_hash, plan, plan_expires_at, created_at, last_login_at"
                + " FROM users WHERE login_name = ? LIMIT 1",
            loginName);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public void touchLogin(long userId) {
        jdbc.update("UPDATE users SET last_login_at = NOW() WHERE id = ?", userId);
    }

    /** 这一行的显示名：支付宝账号给 uid 后四位，账号密码登录给登录名。 */
    public static Handle handleOf(Map<String, Object> row) {
        Object alipay = row.get("alipay_uid");
        if (alipay != null && !String.valueOf(alipay).isBlank()) {
            String uid = String.valueOf(alipay);
            return new Handle("alipay", uid.length() <= TAIL_LENGTH ? uid : uid.substring(uid.length() - TAIL_LENGTH));
        }
        Object login = row.get("login_name");
        return new Handle("password", login == null ? "" : String.valueOf(login));
    }

    public static final class Handle {

        private final String kind;
        private final String label;

        Handle(String kind, String label) {
            this.kind = kind;
            this.label = label;
        }

        public String kind() {
            return kind;
        }

        public String label() {
            return label;
        }
    }

    public String createSession(long userId) {
        String token = newToken();
        jdbc.update(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))",
            hashToken(token), userId, props.getSessionDays());
        return token;
    }

    public Map<String, Object> sessionUser(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT u.id, u.alipay_uid, u.login_name, u.plan, u.plan_expires_at, u.created_at, u.last_login_at"
                + " FROM sessions s JOIN users u ON u.id = s.user_id"
                + " WHERE s.token_hash = ? AND s.expires_at > NOW() LIMIT 1",
            hashToken(token));
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 认会话：令牌不对就 401，接口里不用再重复写这句。 */
    public Map<String, Object> requireUser(String token, String why) {
        Map<String, Object> row = sessionUser(token);
        if (row == null) {
            throw new ApiException(401, why);
        }
        return row;
    }

    public static long userIdOf(Map<String, Object> row) {
        Object id = row.get("id");
        return id instanceof Number number ? number.longValue() : Long.parseLong(String.valueOf(id));
    }

    public void dropSession(String token) {
        jdbc.update("DELETE FROM sessions WHERE token_hash = ?", hashToken(token));
    }

    public boolean dropAccount(String token) {
        if (token == null || token.isBlank()) {
            return false;
        }
        List<Long> rows = jdbc.queryForList(
            "SELECT user_id FROM sessions WHERE token_hash = ? LIMIT 1", Long.class, hashToken(token));
        if (rows.isEmpty()) {
            return false;
        }
        Long userId = rows.get(0);
        // users 上的外键是 ON DELETE CASCADE，会话和订单跟着走
        jdbc.update("DELETE FROM users WHERE id = ?", userId);
        return true;
    }

    public void createOrder(String outTradeNo, long userId, int days, long amountCent) {
        jdbc.update(
            "INSERT INTO orders (out_trade_no, user_id, plan, days, amount_cent) VALUES (?, ?, ?, ?, ?)",
            outTradeNo, userId, "pro", days, amountCent);
    }

    public Map<String, Object> getOrder(String outTradeNo) {
        if (outTradeNo == null || outTradeNo.isBlank()) {
            return null;
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT out_trade_no, user_id, plan, days, amount_cent, status, trade_no, buyer_id,"
                + " refund_status, refund_cent, refunded_at, refund_request_no, created_at, paid_at"
                + " FROM orders WHERE out_trade_no = ? LIMIT 1",
            outTradeNo);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 发货：先把订单从 created 推到 paid，这条 UPDATE 只有一次机会（更新行数说了算），
     * 抢到了才加天数 —— 通知会重发、查单也会重复调，幂等靠的就是这道闸。
     * 通知和主动查单共用这一个入口，两条路径的行为不允许分叉。
     */
    @Transactional
    public boolean deliverPaid(String outTradeNo, String tradeNo, String buyerId) {
        int hit = jdbc.update(
            "UPDATE orders SET status = 'paid', paid_at = NOW(), trade_no = ?, buyer_id = IFNULL(?, buyer_id)"
                + " WHERE out_trade_no = ? AND status = 'created'",
            tradeNo, buyerId, outTradeNo);
        if (hit == 0) {
            return false;
        }
        Map<String, Object> order = jdbc.queryForMap(
            "SELECT user_id, days FROM orders WHERE out_trade_no = ? LIMIT 1", outTradeNo);
        Object days = order.get("days");
        Object userId = order.get("user_id");
        // 还没到期就在原到期日后续加，已经过期就从今天起算
        jdbc.update(
            "UPDATE users SET plan = 'pro',"
                + " plan_expires_at = DATE_ADD(GREATEST(COALESCE(plan_expires_at, NOW()), NOW()), INTERVAL ? DAY)"
                + " WHERE id = ?",
            days, userId);
        return true;
    }

    /** 权益快照：管理端补发/退款前后的 before/after 都读这一份。 */
    public Map<String, Object> userPlanRow(long userId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT id, login_name, alipay_uid, plan, plan_expires_at FROM users WHERE id = ? LIMIT 1",
            userId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 管理端手工补发：没有订单可查时的线下补偿路径，必须配审计 */
    @Transactional
    public boolean grantPlan(long userId, int days) {
        return jdbc.update(
            "UPDATE users SET plan = 'pro',"
                + " plan_expires_at = DATE_ADD(GREATEST(COALESCE(plan_expires_at, NOW()), NOW()), INTERVAL ? DAY)"
                + " WHERE id = ?",
            days, userId) > 0;
    }

    /** 管理端手工撤销：从到期日往前扣，扣到当天就降免费 */
    @Transactional
    public boolean revokePlan(long userId, int days) {
        int hit = jdbc.update(
            "UPDATE users SET plan_expires_at = DATE_SUB(plan_expires_at, INTERVAL ? DAY)"
                + " WHERE id = ? AND plan_expires_at IS NOT NULL",
            days, userId);
        if (hit == 0) {
            return false;
        }
        jdbc.update(
            "UPDATE users SET plan = 'free', plan_expires_at = NULL"
                + " WHERE id = ? AND (plan_expires_at IS NULL OR plan_expires_at <= NOW())",
            userId);
        return true;
    }

    public void closeOrder(String outTradeNo) {
        jdbc.update("UPDATE orders SET status = 'closed' WHERE out_trade_no = ? AND status = 'created'", outTradeNo);
    }

    public String planState(Map<String, Object> row) {
        if (row == null || !"pro".equals(String.valueOf(row.get("plan")))) {
            return "free";
        }
        Instant expires = instantOf(row.get("plan_expires_at"));
        return expires != null && expires.isAfter(Instant.now()) ? "pro" : "free";
    }

    public static Instant instantOf(Object value) {
        if (value instanceof Timestamp ts) {
            return ts.toLocalDateTime().atZone(SHANGHAI).toInstant();
        }
        if (value instanceof LocalDateTime ldt) {
            return ldt.atZone(SHANGHAI).toInstant();
        }
        if (value instanceof java.util.Date date) {
            return date.toInstant();
        }
        return null;
    }

    public static String hashToken(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return AlipayClient.hex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("这台 JVM 没有 SHA-256", e);
        }
    }

    public static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void sweepOnStart() {
        sweep();
    }

    @Scheduled(fixedDelay = 3600000L, initialDelay = 3600000L)
    public void sweep() {
        try {
            Map<String, Object> cleared = purgeExpired();
            int sessions = (Integer) cleared.get("sessions");
            int states = (Integer) cleared.get("states");
            if (sessions > 0 || states > 0) {
                log.info("[fitplan-api] 清了 {} 条到期会话 / {} 个放凉的 state", sessions, states);
            }
        } catch (Exception e) {
            log.warn("[fitplan-api] 这轮清理没跑成：{}", e.getMessage());
        }
    }
}
