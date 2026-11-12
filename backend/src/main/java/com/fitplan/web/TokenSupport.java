package com.fitplan.web;

import jakarta.servlet.http.HttpServletRequest;

/** 认会话的令牌只从 Authorization: Bearer 里来，和 Node 版一致。 */
public final class TokenSupport {

    private TokenSupport() {
    }

    public static String bearer(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            return "";
        }
        return header.substring(7).trim();
    }
}
