package com.fitplan.auth;

import java.util.Map;

/** 体验账号的固定标识，初始化、登录和前端展示共用这一份。 */
public final class DemoAccounts {

    public static final String USER = "user";
    public static final String ADMIN = "admin";

    public static final Map<String, String> USERNAMES = Map.of(
        USER, "demo_user",
        ADMIN, "demo_admin");

    public static final Map<String, String> LABELS = Map.of(
        USER, "体验用户",
        ADMIN, "体验管理员");

    private DemoAccounts() {
    }
}
