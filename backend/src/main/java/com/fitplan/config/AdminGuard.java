package com.fitplan.config;

import com.fitplan.service.AdminService;
import com.fitplan.web.TokenSupport;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * /api/admin/** 的守卫：没配置管理端、令牌不对、IP 不在白名单，一律回 404，
 * 不给攻击者留「这里有个管理入口」的信号。登录接口由 WebConfig 排除在外。
 */
@Component
public class AdminGuard implements HandlerInterceptor {

    private final AdminService admin;

    public AdminGuard(AdminService admin) {
        this.admin = admin;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
        throws IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        if (!admin.enabled() || !admin.ipAllowed(request.getRemoteAddr())) {
            notFound(response);
            return false;
        }
        Map<String, Object> session = admin.sessionByToken(TokenSupport.bearer(request));
        if (session == null) {
            notFound(response);
            return false;
        }
        request.setAttribute("fitplan.admin", session);
        return true;
    }

    private static void notFound(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_NOT_FOUND);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"没有这个接口\"}");
    }
}