package com.fitplan.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

    @Mock
    JdbcTemplate jdbc;

    AccountService service;

    @BeforeEach
    void setUp() {
        service = new AccountService(jdbc);
    }

    @Test
    @DisplayName("首次支付通知：订单转 paid 并顺延 VIP")
    void fulfillSuccess() {
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForMap(anyString(), eq("T2026"))).thenReturn(Map.of("user_id", 5L, "days", 30));

        boolean changed = service.fulfill("T2026", "ALI-1");

        assertThat(changed).isTrue();
        verify(jdbc).update(contains("status = 'paid'"), eq("ALI-1"), eq("T2026"));
        verify(jdbc).update(contains("plan_expires_at = DATE_ADD"), eq(30), eq(5L));
    }

    @Test
    @DisplayName("重复支付通知：只发一次货")
    void fulfillDuplicate() {
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(0);

        boolean changed = service.fulfill("T2026", "ALI-1");

        assertThat(changed).isFalse();
        verify(jdbc, never()).queryForMap(anyString(), any(Object[].class));
    }

    @Test
    @DisplayName("关闭未支付订单")
    void closeOrder() {
        service.closeOrder("T2026");

        verify(jdbc).update(contains("status = 'closed'"), eq("T2026"));
    }
}
