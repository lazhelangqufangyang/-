package com.fitplan.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitplan.config.ApiException;
import com.fitplan.service.AdminService;
import com.fitplan.service.JsonUtil;
import com.fitplan.service.LoginGuard;
import com.fitplan.service.PasswordHash;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端登录：独立账号、独立会话，令牌和用户令牌互不通用。
 * 口令接口挂在公网上会被试，所以和用户登录共用 LoginGuard，键里带 admin 前缀区分。
 */
@RestController
public class AdminAuthController {

    private static final String BAD_CREDENTIALS = "账号或密码不对。";
    private static final String NOT_FOUND = "没有这个接口";

    private final AdminService admin;
    private final LoginGuard guard;

    public AdminAuthController(AdminService admin, LoginGuard guard) {
        this.admin = admin;
        this.guard = guard;
    }

    @PostMapping("/api/admin/auth/login")
    public Map<String, Object> login(HttpServletRequest request, @RequestBody(required = false) JsonNode body) {
        if (!admin.enabled() || !admin.ipAllowed(request.getRemoteAddr())) {
            // 没配置管理端时连「管理端存在」都不说
            throw new ApiException(404, NOT_FOUND);
        }
        String loginName = text(body, "loginName").trim().toLowerCase(Locale.ROOT);
        String password = text(body, "password");
        String key = "admin|" + request.getRemoteAddr() + "|" + loginName;
        if (guard.blocked(key)) {
            throw new ApiException(429, "试的次数太多了，" + guard.retryAfterSeconds(key) + " 秒之后再来。");
        }
        Map<String, Object> row = loginName.isEmpty() || password.isEmpty() ? null : admin.adminRow(loginName);
        if (row == null || disabled(row) || !PasswordHash.matches(password, String.valueOf(row.get("password_hash")))) {
            guard.failed(key);
            // 账号存不存在、口令错没错都回同一句话
            throw new ApiException(401, BAD_CREDENTIALS);
        }
        long adminId = ((Number) row.get("id")).longValue();
        admin.touchLogin(adminId);
        guard.passed(key);
        String token = admin.createSession(adminId);
        Map<String, Object> session = admin.sessionByToken(token);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", token);
        out.put("loginName", String.valueOf(row.get("login_name")));
        out.put("expiresAt", JsonUtil.iso(session == null ? null : session.get("expires_at")));
        return out;
    }

    @PostMapping("/api/admin/auth/logout")
    public Map<String, Object> logout(HttpServletRequest request) {
        admin.dropSession(TokenSupport.bearer(request));
        return Map.of();
    }

    @GetMapping("/api/admin/me")
    @SuppressWarnings("unchecked")
    public Map<String, Object> me(HttpServletRequest request) {
        Map<String, Object> session = (Map<String, Object>) request.getAttribute("fitplan.admin");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("loginName", session == null ? null : String.valueOf(session.get("login_name")));
        out.put("expiresAt", session == null ? null : JsonUtil.iso(session.get("expires_at")));
        return out;
    }

    private static String text(JsonNode body, String field) {
        String value = JsonUtil.text(body, field);
        return value == null ? "" : value;
    }

    private static boolean disabled(Map<String, Object> row) {
        Object value = row.get("disabled");
        return value instanceof Number number && number.intValue() != 0;
    }
}