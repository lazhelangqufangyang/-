package com.fitplan.service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * 登录失败的次数账：公网上挂着的口令接口一定会被试，撞够次数就冷一段时间。
 * 计数按「登录名 + 来源地址」记，只存在这个进程的内存里，重启即清零。
 */
@Component
public class LoginGuard {

    private static final int MAX_FAILS = 8;
    private static final long WINDOW_MS = 15 * 60 * 1000L;
    /** 键是无界的（ anyone 能造登录名），攒到这个数就先清一轮，不让这张表把内存吃掉 */
    private static final int MAX_KEYS = 5000;

    private final Map<String, Attempts> table = new ConcurrentHashMap<>();

    public boolean blocked(String key) {
        Attempts attempts = table.get(key);
        return attempts != null && attempts.count >= MAX_FAILS && System.currentTimeMillis() - attempts.lastMs < WINDOW_MS;
    }

    /** 还要等多久，单位秒；没被挡住回 0 */
    public int retryAfterSeconds(String key) {
        Attempts attempts = table.get(key);
        if (attempts == null || attempts.count < MAX_FAILS) {
            return 0;
        }
        long left = WINDOW_MS - (System.currentTimeMillis() - attempts.lastMs);
        return left <= 0 ? 0 : (int) Math.ceil(left / 1000.0);
    }

    public void failed(String key) {
        if (table.size() > MAX_KEYS) {
            purgeStale();
        }
        table.compute(key, (ignored, current) -> {
            Attempts next = current == null ? new Attempts() : current;
            next.count += 1;
            next.lastMs = System.currentTimeMillis();
            return next;
        });
    }

    public void passed(String key) {
        table.remove(key);
    }

    private void purgeStale() {
        long now = System.currentTimeMillis();
        table.entrySet().removeIf(entry -> now - entry.getValue().lastMs >= WINDOW_MS);
    }

    private static final class Attempts {

        private int count;
        private long lastMs = System.currentTimeMillis();
    }
}
