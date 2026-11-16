package com.fitplan.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.fitplan.auth.common.AuthException;
import com.fitplan.auth.common.ResultCode;
import com.fitplan.auth.dto.AuthResponse;
import com.fitplan.auth.dto.DemoInfo;
import com.fitplan.auth.entity.SysUser;
import com.fitplan.auth.mapper.SysUserMapper;
import com.fitplan.auth.security.JwtService;
import com.fitplan.auth.security.LoginRateLimiter;
import com.fitplan.auth.security.TokenBlacklist;
import com.fitplan.config.FitplanProperties;
import com.fitplan.testsupport.MybatisTestSupport;
import java.time.Instant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class DemoLoginTest {

    @Mock
    SysUserMapper users;
    @Mock
    PasswordEncoder encoder;
    @Mock
    JwtService jwt;
    @Mock
    LoginRateLimiter rateLimiter;
    @Mock
    TokenBlacklist blacklist;

    FitplanProperties props;
    AuthService service;

    @BeforeAll
    static void initTableInfo() {
        MybatisTestSupport.init();
    }

    @BeforeEach
    void setUp() {
        props = new FitplanProperties();
        service = new AuthService(users, encoder, jwt, rateLimiter, blacklist, props);
        lenient().when(jwt.issue(anyLong()))
            .thenReturn(new JwtService.Issued("demo-token", Instant.now().plusSeconds(7200)));
        lenient().when(jwt.expiresInSeconds()).thenReturn(7200L);
    }

    @Test
    @DisplayName("快捷登录关闭：返回 403001")
    void disabledFeature() {
        assertThatThrownBy(() -> service.demoLogin("user", "127.0.0.1"))
            .isInstanceOf(AuthException.class)
            .satisfies(error -> assertThat(((AuthException) error).code()).isEqualTo(ResultCode.FORBIDDEN));
    }

    @Test
    @DisplayName("快捷登录开启：返回两个体验账号")
    void demoInfoEnabled() {
        props.getAuth().setDemoLogin(true);
        DemoInfo info = service.demoInfo();
        assertThat(info.enabled()).isTrue();
        assertThat(info.accounts()).hasSize(2);
        assertThat(info.accounts().get(0).account()).isEqualTo(DemoAccounts.USER);
        assertThat(info.accounts().get(1).account()).isEqualTo(DemoAccounts.ADMIN);
    }

    @Test
    @DisplayName("快捷登录：未知账号返回 400001")
    void unknownAccount() {
        props.getAuth().setDemoLogin(true);
        assertThatThrownBy(() -> service.demoLogin("root", "127.0.0.1"))
            .isInstanceOf(AuthException.class)
            .satisfies(error -> assertThat(((AuthException) error).code()).isEqualTo(ResultCode.PARAM_INVALID));
    }

    @Test
    @DisplayName("快捷登录：管理员体验账号签发 ADMIN 身份")
    void adminLogin() {
        props.getAuth().setDemoLogin(true);
        SysUser user = new SysUser();
        user.setId(18L);
        user.setUsername("demo_admin");
        user.setNickname("体验管理员");
        user.setRole("ADMIN");
        user.setStatus(1);
        user.setPlan("free");
        when(users.selectOne(any())).thenReturn(user);

        AuthResponse response = service.demoLogin("admin", "127.0.0.1");

        assertThat(response.token()).isEqualTo("demo-token");
        assertThat(response.user().role()).isEqualTo("ADMIN");
        assertThat(response.user().username()).isEqualTo("demo_admin");
    }

    @Test
    @DisplayName("快捷登录：停用的体验账号返回 401003")
    void disabledAccount() {
        props.getAuth().setDemoLogin(true);
        SysUser user = new SysUser();
        user.setId(17L);
        user.setUsername("demo_user");
        user.setStatus(0);
        when(users.selectOne(any())).thenReturn(user);

        assertThatThrownBy(() -> service.demoLogin("user", "127.0.0.1"))
            .isInstanceOf(AuthException.class)
            .satisfies(error -> assertThat(((AuthException) error).code()).isEqualTo(ResultCode.ACCOUNT_DISABLED));
    }
}
