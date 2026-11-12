package com.fitplan.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitplan.config.ApiException;
import com.fitplan.service.AccountService;
import com.fitplan.service.JsonUtil;
import com.fitplan.service.LoginGuard;
import com.fitplan.service.PasswordHash;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 账号密码登录：不依赖支付宝应用和公网回调，任何机器上起了后端就能注册、登录、传记录。
 * 支付宝授权登录照旧在 AuthController 那边，两套认的是同一张 users 表上的同一套会话。
 */
@RestController
public class PasswordAuthController {

    private static final Pattern LOGIN_NAME = Pattern.compile("[\\p{L}\\p{N}._-]{3,32}");
    private static final int PASSWORD_MIN = 8;
    private static final int PASSWORD_MAX = 64;
    private static final String BAD_CREDENTIALS = "账号或口令不对。再试三次会冷十分钟。";

    private final AccountService account;
    private final LoginGuard guard;

    public PasswordAuthController(AccountService account, LoginGuard guard) {
        this.account = account;
        this.guard = guard;
    }

    @PostMapping("/api/auth/register")
    public Map<String, Object> register(HttpServletRequest request, @RequestBody(required = false) JsonNode body) {
        String loginName = loginNameOf(body);
        String password = passwordOf(body);
        String key = key(request, loginName);
        if (guard.blocked(key)) {
            throw new ApiException(429, "试的次数太多了，" + guard.retryAfterSeconds(key) + " 秒之后再来。");
        }
        long userId = account.createPasswordUser(loginName, PasswordHash.create(password));
        guard.passed(key);
        // 刚插进去的一行 plan 就是表上的默认值 free，不必再读一遍库
        return issued(userId, loginName, "free");
    }

    @PostMapping("/api/auth/login")
    public Map<String, Object> login(HttpServletRequest request, @RequestBody(required = false) JsonNode body) {
        String loginName = loginNameOf(body);
        String password = passwordOf(body);
        String key = key(request, loginName);
        if (guard.blocked(key)) {
            throw new ApiException(429,
                "这个账号试得太多了，" + guard.retryAfterSeconds(key) + " 秒之后再来。");
        }
        Map<String, Object> row = account.passwordUser(loginName);
        if (row == null || !PasswordHash.matches(password, String.valueOf(orEmpty(row.get("password_hash"))))) {
            guard.failed(key);
            // 账号存不存在回同一句话，免得这张表被人一个一个试出来
            throw new ApiException(401, BAD_CREDENTIALS);
        }
        long userId = AccountService.userIdOf(row);
        account.touchLogin(userId);
        guard.passed(key);
        return issued(userId, loginName, account.planState(row));
    }

    private Map<String, Object> issued(long userId, String loginName, String plan) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", account.createSession(userId));
        out.put("kind", "password");
        out.put("handle", loginName);
        out.put("plan", plan);
        return out;
    }

    /** 存的时候统一小写：登录名里那串字母的大小写不该分出两个账号来 */
    private static String loginNameOf(JsonNode body) {
        String raw = JsonUtil.text(body, "loginName");
        if (raw == null || raw.isBlank()) {
            throw new ApiException(400, "要填账号名。");
        }
        String name = raw.trim().toLowerCase(Locale.ROOT);
        if (!LOGIN_NAME.matcher(name).matches()) {
            throw new ApiException(400, "账号名 3–32 个字符，只能用中英文、数字和 . _ -。");
        }
        return name;
    }

    private static String passwordOf(JsonNode body) {
        String raw = JsonUtil.text(body, "password");
        if (raw == null) {
            throw new ApiException(400, "要填口令。");
        }
        if (raw.length() < PASSWORD_MIN || raw.length() > PASSWORD_MAX) {
            throw new ApiException(400, "口令要 " + PASSWORD_MIN + "–" + PASSWORD_MAX + " 个字符。");
        }
        if (raw.chars().allMatch(Character::isDigit)) {
            throw new ApiException(400, "口令不能全是数字。");
        }
        return raw;
    }

    /** 穿透和反向代理后面拿真实来客地址要靠这个头；它只用来当限流键，不参与任何判断 */
    private static String remoteIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private static String key(HttpServletRequest request, String loginName) {
        return loginName + '|' + remoteIp(request);
    }

    private static String orEmpty(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
