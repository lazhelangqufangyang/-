package com.fitplan.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fitplan.admin.dto.AdminOrderView;
import com.fitplan.admin.mapper.OperationLogMapper;
import com.fitplan.admin.service.AdminService;
import com.fitplan.admin.service.AuditService;
import com.fitplan.auth.entity.SysUser;
import com.fitplan.auth.mapper.SysUserMapper;
import com.fitplan.auth.security.AuthUser;
import com.fitplan.config.ApiException;
import com.fitplan.service.AlipayClient;
import com.fitplan.testsupport.MybatisTestSupport;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class AdminServiceTest {

    @Mock
    SysUserMapper users;
    @Mock
    OperationLogMapper logs;
    @Mock
    AuditService audit;
    @Mock
    AlipayClient alipay;
    @Mock
    JdbcTemplate jdbc;

    AdminService service;

    @BeforeAll
    static void initTableInfo() {
        MybatisTestSupport.init();
    }

    @BeforeEach
    void setUp() {
        service = new AdminService(users, logs, audit, alipay, jdbc);
    }

    @Test
    @DisplayName("管理员不能停用自己")
    void cannotDisableSelf() {
        SysUser admin = user(1L, "admin", "ADMIN", 1);
        when(users.selectById(1L)).thenReturn(admin);

        assertThatThrownBy(() -> service.setStatus(operator(1L), 1L, 0, "127.0.0.1", "ua"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("不能停用当前登录的管理员");
    }

    @Test
    @DisplayName("至少保留一个启用中的管理员")
    void keepLastAdmin() {
        when(users.selectById(2L)).thenReturn(user(2L, "admin2", "ADMIN", 1));
        when(jdbc.queryForList(anyString(), eq(Long.class))).thenReturn(List.of(2L));

        assertThatThrownBy(() -> service.setStatus(operator(1L), 2L, 0, "127.0.0.1", "ua"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("至少保留一个启用中的管理员");
    }

    @Test
    @DisplayName("还有别的启用管理员时可以停用")
    void disableAdminWithAnotherActive() {
        when(users.selectById(2L)).thenReturn(user(2L, "admin2", "ADMIN", 1));
        when(jdbc.queryForList(anyString(), eq(Long.class))).thenReturn(List.of(1L, 2L));

        service.setStatus(operator(1L), 2L, 0, "127.0.0.1", "ua");

        verify(users).update(eq(null), any());
        verify(audit).record(eq("ADMIN_DISABLE_USER"), eq("SUCCESS"), eq(1L), eq("admin"),
            eq("ADMIN"), eq("USER"), eq(2L), eq("停用账号"), eq("127.0.0.1"), eq("ua"));
    }

    @Test
    @DisplayName("停用普通账号成功并写审计")
    void disableUser() {
        when(users.selectById(5L)).thenReturn(user(5L, "demo_user", "USER", 1));

        service.setStatus(operator(1L), 5L, 0, "127.0.0.1", "ua");

        verify(users).update(eq(null), any());
        verify(audit).record(eq("ADMIN_DISABLE_USER"), eq("SUCCESS"), eq(1L), eq("admin"),
            eq("ADMIN"), eq("USER"), eq(5L), eq("停用账号"), eq("127.0.0.1"), eq("ua"));
    }

    @Test
    @DisplayName("手填天数开通 VIP：从较晚时间顺延")
    void grantVip() {
        SysUser target = user(5L, "demo_user", "USER", 1);
        when(users.selectById(5L)).thenReturn(target);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

        service.grantVip(operator(1L), 5L, 30, "127.0.0.1", "ua");

        verify(jdbc).update(anyString(), any(Object[].class));
        verify(audit).record(eq("ADMIN_GRANT_VIP"), eq("SUCCESS"), eq(1L), eq("admin"),
            eq("ADMIN"), eq("USER"), eq(5L), eq("开通 30 天"), eq("127.0.0.1"), eq("ua"));
    }

    @Test
    @DisplayName("只有待支付订单可以关闭")
    void closePaidOrderRejected() {
        when(jdbc.queryForList(anyString(), eq("T2026"))).thenReturn(List.of(order("paid", 5L, 30, 800)));

        assertThatThrownBy(() -> service.closeOrder(operator(1L), "T2026", "127.0.0.1", "ua"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("只有待支付的订单可以关闭");
    }

    @Test
    @DisplayName("只有已支付订单可以退款")
    void refundCreatedOrderRejected() {
        when(jdbc.queryForList(anyString(), eq("T2026"))).thenReturn(List.of(order("created", 5L, 30, 800)));

        assertThatThrownBy(() -> service.refundOrder(operator(1L), "T2026", "127.0.0.1", "ua"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("只有已支付的订单可以退款");
    }

    @Test
    @DisplayName("未配置支付宝时拒绝退款")
    void refundWithoutAlipayRejected() {
        when(jdbc.queryForList(anyString(), eq("T2026"))).thenReturn(List.of(order("paid", 5L, 30, 800)));
        when(alipay.alipayMissing()).thenReturn(List.of("ALIPAY_APP_ID"));

        assertThatThrownBy(() -> service.refundOrder(operator(1L), "T2026", "127.0.0.1", "ua"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("支付宝未配置");
    }

    @Test
    @DisplayName("退款成功：订单转 refunded 并扣回 VIP 天数")
    void refundSuccess() {
        when(jdbc.queryForList(anyString(), eq("T2026"))).thenReturn(List.of(order("paid", 5L, 30, 800)));
        when(alipay.alipayMissing()).thenReturn(List.of());
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        AdminOrderView view = new AdminOrderView(
            "T2026", 5L, "demo_user", "体验用户", "pro", 30, 800L, "refunded", null, null, null, null);
        when(jdbc.queryForObject(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(view);

        AdminOrderView result = service.refundOrder(operator(1L), "T2026", "127.0.0.1", "ua");

        assertThat(result.status()).isEqualTo("refunded");
        verify(alipay).refund("T2026", 800, "管理员退款");
        verify(audit).record(eq("ADMIN_REFUND_ORDER"), eq("SUCCESS"), eq(1L), eq("admin"),
            eq("ADMIN"), eq("ORDER"), eq(5L), eq("退款 8.00 元，订单 T2026"), eq("127.0.0.1"), eq("ua"));
    }

    private static SysUser user(long id, String username, String role, int status) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setUsername(username);
        user.setNickname(username);
        user.setRole(role);
        user.setStatus(status);
        user.setPlan("free");
        return user;
    }

    private static AuthUser operator(long id) {
        return new AuthUser(id, null, "admin", "管理员", "ADMIN", "free",
            null, null, null, "jti", Instant.now().plusSeconds(600));
    }

    private static Map<String, Object> order(String status, long userId, int days, long amountCent) {
        return Map.of("status", status, "user_id", userId, "days", days, "amount_cent", amountCent);
    }
}
