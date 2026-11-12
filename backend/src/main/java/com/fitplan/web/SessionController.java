package com.fitplan.web;

import com.fitplan.config.ApiException;
import com.fitplan.service.AccountService;
import com.fitplan.service.JsonUtil;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SessionController {

    private final AccountService account;

    public SessionController(AccountService account) {
        this.account = account;
    }

    @GetMapping("/api/session")
    public Map<String, Object> session(HttpServletRequest request) {
        Map<String, Object> user = account.requireUser(TokenSupport.bearer(request), "没有有效会话");
        AccountService.Handle handle = AccountService.handleOf(user);
        Map<String, Object> out = new LinkedHashMap<>();
        // 支付宝账号只回 uid 后四位，账号密码登录回登录名：全量 uid 不出后端
        out.put("kind", handle.kind());
        out.put("handle", handle.label());
        out.put("plan", account.planState(user));
        out.put("planExpiresAt", JsonUtil.iso(user.get("plan_expires_at")));
        out.put("createdAt", JsonUtil.iso(user.get("created_at")));
        out.put("lastLoginAt", JsonUtil.iso(user.get("last_login_at")));
        return out;
    }

    @DeleteMapping("/api/session")
    public Map<String, Object> logout(HttpServletRequest request) {
        String token = TokenSupport.bearer(request);
        if (token.isEmpty()) {
            throw new ApiException(401, "没有会话可退出");
        }
        account.dropSession(token);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("dropped", "session");
        return out;
    }

    @DeleteMapping("/api/account")
    public Map<String, Object> close(HttpServletRequest request) {
        String token = TokenSupport.bearer(request);
        boolean gone = !token.isEmpty() && account.dropAccount(token);
        if (!gone) {
            throw new ApiException(401, "会话无效，删不了");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("dropped", "account");
        return out;
    }
}
