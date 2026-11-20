package com.fitplan.config;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 建表和 Node 版 setup 用同一份 server/schema.sql，不在这边再抄一遍 DDL。
 * 起来时先把库建出来（不存在才建），再逐条执行 IF NOT EXISTS 的建表语句。
 */
@Component
public class SchemaInitializer {

    private static final Logger log = LoggerFactory.getLogger(SchemaInitializer.class);
    private static final Pattern DB_URL = Pattern.compile("jdbc:mysql://([^/]+)/([^?]*)(\\?.*)?");
    private static final List<String> CANDIDATES =
        List.of("server/schema.sql", "../server/schema.sql", "../../server/schema.sql");

    private final JdbcTemplate jdbc;
    private final Environment env;

    public SchemaInitializer(JdbcTemplate jdbc, Environment env) {
        this.jdbc = jdbc;
        this.env = env;
    }

    @PostConstruct
    public void init() {
        String url = env.getProperty("spring.datasource.url");
        if (url == null || url.isBlank()) {
            return;
        }
        Matcher m = DB_URL.matcher(url);
        if (!m.matches()) {
            log.warn("[fitplan-api] 认不出 spring.datasource.url，跳过建表");
            return;
        }
        String host = m.group(1);
        String database = m.group(2);
        String query = m.group(3) == null ? "" : m.group(3);
        if (database == null || database.isBlank()) {
            return;
        }
        String user = env.getProperty("spring.datasource.username", "root");
        String password = env.getProperty("spring.datasource.password", "");

        try (Connection conn = DriverManager.getConnection("jdbc:mysql://" + host + "/" + query, user, password);
             Statement st = conn.createStatement()) {
            st.execute("CREATE DATABASE IF NOT EXISTS `" + database.replace("`", "") + "` CHARACTER SET utf8mb4");
        } catch (Exception e) {
            log.warn("[fitplan-api] 建库失败（库已经存在就忽略）：{}", e.getMessage());
        }

        Path schema = locate();
        if (schema == null) {
            log.warn("[fitplan-api] 没找到 server/schema.sql，跳过建表");
            return;
        }
        try {
            for (String statement : statements(Files.readString(schema, StandardCharsets.UTF_8))) {
                jdbc.execute(statement);
            }
            upgradeUsers();
            upgradeOrders();
            upgradeMealLogs();
            log.info("[fitplan-api] 建表就位（{}）", schema.toAbsolutePath());
        } catch (Exception e) {
            log.warn("[fitplan-api] 建表没跑完：{}", e.getMessage());
        }
    }

    /**
     * CREATE TABLE IF NOT EXISTS 对已有库什么都不做，所以老库要靠这里补列：
     * 账号密码登录要 login_name / password_hash，还要让 alipay_uid 能空着
     * （只用账号密码注册的人没有支付宝 uid）。反复跑不改动已有数据。
     */
    private void upgradeUsers() {
        if (columnType("users", "alipay_uid") == null) {
            return;
        }
        if (columnType("users", "login_name") == null) {
            jdbc.execute("ALTER TABLE users ADD COLUMN login_name VARCHAR(64) NULL"
                + " COMMENT '账号密码注册的登录名，全库唯一，存的时候统一小写' AFTER alipay_uid");
        }
        if (columnType("users", "password_hash") == null) {
            jdbc.execute("ALTER TABLE users ADD COLUMN password_hash VARCHAR(160) NULL"
                + " COMMENT 'PBKDF2-HMAC-SHA256 的散列（带迭代数和盐），口令本身不落库' AFTER login_name");
        }
        if (!indexExists("users", "uk_users_login_name")) {
            jdbc.execute("ALTER TABLE users ADD UNIQUE KEY uk_users_login_name (login_name)");
        }
        if ("NO".equals(columnNullable("users", "alipay_uid"))) {
            jdbc.execute("ALTER TABLE users MODIFY COLUMN alipay_uid VARCHAR(64) NULL"
                + " COMMENT '支付宝 user_id，只用来认人，页面只显示后四位；账号密码注册的账号这一列空着'");
        }
        log.info("[fitplan-api] users 表的账号密码列已就位");
    }

    /**
     * 老库的 orders 表没有退款和 buyer 这几列。schema.sql 里的 CREATE TABLE IF NOT EXISTS
     * 对已存在的表不生效，所以在这里逐列补；列名都是常量，不拼接外部输入。
     */
    private void upgradeOrders() {
        if (columnType("orders", "out_trade_no") == null) {
            return;
        }
        addColumn("orders", "buyer_id",
            "VARCHAR(64) NULL COMMENT '支付宝 buyer_id，通知或查单回来记下，只做对认人' AFTER trade_no");
        addColumn("orders", "refund_status",
            "ENUM('none','refunded') NOT NULL DEFAULT 'none' AFTER buyer_id");
        addColumn("orders", "refund_cent",
            "INT UNSIGNED NULL COMMENT '实际退款金额（分）' AFTER refund_status");
        addColumn("orders", "refunded_at", "DATETIME NULL AFTER refund_cent");
        addColumn("orders", "refund_request_no",
            "VARCHAR(64) NULL COMMENT '传给支付宝的 out_request_no' AFTER refunded_at");
    }

    private void addColumn(String table, String column, String definition) {
        if (columnType(table, column) == null) {
            jdbc.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
            log.info("[fitplan-api] {} 表补列 {}", table, column);
        }
    }

    /** 老库的饮食记录没有微量元素列：云端整份备份要能带上，所以在启动时逐列补 */
    private void upgradeMealLogs() {
        if (columnType("meal_logs", "log_id") == null) {
            return;
        }
        addColumn("meal_logs", "fiber_g", "DECIMAL(7,1) NULL AFTER sodium_mg");
        addColumn("meal_logs", "calcium_mg", "DECIMAL(8,1) NULL AFTER fiber_g");
        addColumn("meal_logs", "iron_mg", "DECIMAL(6,1) NULL AFTER calcium_mg");
        addColumn("meal_logs", "potassium_mg", "DECIMAL(8,1) NULL AFTER iron_mg");
        addColumn("meal_logs", "vitamin_d_mcg", "DECIMAL(7,1) NULL AFTER potassium_mg");
        addColumn("meal_logs", "vitamin_b12_mcg", "DECIMAL(7,1) NULL AFTER vitamin_d_mcg");
        addColumn("meal_logs", "magnesium_mg", "DECIMAL(8,1) NULL AFTER vitamin_b12_mcg");
    }

    /** 返回该列的类型，列不存在返回 null */
    private String columnType(String table, String column) {
        List<String> rows = jdbc.queryForList(
            "SELECT DATA_TYPE FROM information_schema.COLUMNS"
                + " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
            String.class, table, column);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private String columnNullable(String table, String column) {
        List<String> rows = jdbc.queryForList(
            "SELECT IS_NULLABLE FROM information_schema.COLUMNS"
                + " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
            String.class, table, column);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private boolean indexExists(String table, String index) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM information_schema.STATISTICS"
                + " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
            Integer.class, table, index);
        return count != null && count > 0;
    }

    private static Path locate() {
        String override = System.getProperty("fitplan.schema-file");
        if (FitplanProperties.isBlank(override)) {
            override = System.getenv("FITPLAN_SCHEMA_FILE");
        }
        if (!FitplanProperties.isBlank(override)) {
            Path direct = Path.of(override.trim());
            return Files.isReadable(direct) ? direct : null;
        }
        for (String candidate : CANDIDATES) {
            Path path = Path.of(candidate);
            if (Files.isReadable(path)) {
                return path;
            }
        }
        return null;
    }

    private static List<String> statements(String schema) throws IOException {
        StringBuilder withoutComments = new StringBuilder();
        for (String line : schema.split("\r?\n")) {
            if (!line.trim().startsWith("--")) {
                withoutComments.append(line).append('\n');
            }
        }
        List<String> out = new ArrayList<>();
        for (String part : withoutComments.toString().split(";")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                out.add(trimmed);
            }
        }
        return out;
    }
}
