package com.fitplan.service;

import com.fitplan.config.FitplanProperties;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** 管理员账号与会话：和用户那一套完全分开，这里只碰 admin_* 三张表。 */
@Service
public class AdminService {

    private static final Logger log = LoggerFactory.getLogger(AdminService.class);

    private final JdbcTemplate jdbc;
    private final FitplanProperties props;

    public AdminService(JdbcTemplate jdbc, FitplanProperties props) {
        this.jdbc = jdbc;
        this.props = props;
    }

    /** 口令少于 12 位视为没配好：宁可不启用，也不要一个能被猜到的管理入口 */
    public boolean enabled() {
        FitplanProperties.Admin admin = props.getAdmin();
        return !FitplanProperties.isBlank(admin.getLogin())
            && !FitplanProperties.isBlank(admin.getPassword())
            && admin.getPassword().trim().length() >= 12;
    }

    public String configuredLogin() {
        return props.getAdmin().getLogin().trim().toLowerCase(Locale.ROOT);
    }

    /** 白名单留空就是不限制；只认连接来源地址，不信任 X-Forwarded-For */
    public boolean ipAllowed(String remoteAddr) {
        String configured = props.getAdmin().getIps();
        if (FitplanProperties.isBlank(configured)) {
            return true;
        }
        for (String part : configured.split(",")) {
            if (part.trim().equals(remoteAddr)) {
                return true;
            }
        }
        return false;
    }

    /** 账号只在启动时创建；已存在就不动，重启不会悄悄改掉现有口令 */
    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        FitplanProperties.Admin admin = props.getAdmin();
        if (!enabled()) {
            if (!FitplanProperties.isBlank(admin.getLogin()) || !FitplanProperties.isBlank(admin.getPassword())) {
                log.warn("[fitplan-api] 管理员配置不完整或密码少于 12 位，管理端不启用");
            }
            return;
        }
        try {
            Integer existing = jdbc.queryForObject(
                "SELECT COUNT(*) FROM admin_users WHERE login_name = ?", Integer.class, configuredLogin());
            if (existing != null && existing > 0) {
                return;
            }
            jdbc.update("INSERT INTO admin_users (login_name, password_hash) VALUES (?, ?)",
                configuredLogin(), PasswordHash.create(admin.getPassword()));
            log.info("[fitplan-api] 管理员账号已种子：{}", configuredLogin());
        } catch (DataAccessException e) {
            log.warn("[fitplan-api] 管理员种子没跑成：{}", e.getMessage());
        }
    }

    public Map<String, Object> adminRow(String loginName) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT id, login_name, password_hash, disabled FROM admin_users WHERE login_name = ? LIMIT 1",
            loginName);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public void touchLogin(long adminId) {
        jdbc.update("UPDATE admin_users SET last_login_at = NOW() WHERE id = ?", adminId);
    }

    public String createSession(long adminId) {
        String token = AccountService.newToken();
        jdbc.update(
            "INSERT INTO admin_sessions (token_hash, admin_id, expires_at)"
                + " VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))",
            AccountService.hashToken(token), adminId, props.getAdmin().getSessionHours());
        return token;
    }

    public Map<String, Object> sessionByToken(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT a.id, a.login_name, s.expires_at FROM admin_sessions s"
                + " JOIN admin_users a ON a.id = s.admin_id"
                + " WHERE s.token_hash = ? AND s.expires_at > NOW() AND a.disabled = 0 LIMIT 1",
            AccountService.hashToken(token));
        return rows.isEmpty() ? null : rows.get(0);
    }

    public void dropSession(String token) {
        jdbc.update("DELETE FROM admin_sessions WHERE token_hash = ?", AccountService.hashToken(token));
    }

    @EventListener(ApplicationReadyEvent.class)
    public void sweepOnStart() {
        sweep();
    }

    @Scheduled(fixedDelay = 3600000L, initialDelay = 3600000L)
    public void sweep() {
        try {
            int rows = jdbc.update("DELETE FROM admin_sessions WHERE expires_at <= NOW()");
            if (rows > 0) {
                log.info("[fitplan-api] 清了 {} 条到期管理员会话", rows);
            }
        } catch (Exception e) {
            log.warn("[fitplan-api] 管理员会话清理没跑成：{}", e.getMessage());
        }
    }
}