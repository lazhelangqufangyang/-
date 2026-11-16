package com.fitplan.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fitplan.auth.common.AuthException;
import com.fitplan.auth.common.ResultCode;
import com.fitplan.auth.dto.AuthResponse;
import com.fitplan.auth.dto.ChangePasswordRequest;
import com.fitplan.auth.dto.LoginRequest;
import com.fitplan.auth.dto.RegisterRequest;
import com.fitplan.auth.entity.SysUser;
import com.fitplan.auth.mapper.SysUserMapper;
import com.fitplan.auth.security.AuthUser;
import com.fitplan.auth.security.JwtService;
import com.fitplan.auth.security.LoginRateLimiter;
import com.fitplan.auth.security.TokenBlacklist;
import com.fitplan.testsupport.MybatisTestSupport;
import java.time.Instant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

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

    AuthService service;

    @BeforeAll
    static void initTableInfo() {
        MybatisTestSupport.init();
    }

    @BeforeEach
    void setUp() {
        service = new AuthService(users, encoder, jwt, rateLimiter, blacklist, new com.fitplan.config.FitplanProperties());
        lenient().when(jwt.issue(anyLong()))
            .thenReturn(new JwtService.Issued("jwt-token", Instant.now().plusSeconds(7200)));
        lenient().when(jwt.expiresInSeconds()).thenReturn(7200L);
    }

    @Test
    @DisplayName("注册成功：写入 BCrypt 密文并签发 JWT")
    void registerSuccess() {
        when(users.selectCount(any())).thenReturn(0L);
        when(encoder.encode("Test12345")).thenReturn("bcrypt-hash");
        doAnswer(invocation -> {
            SysUser row = invocation.getArgument(0);
            row.setId(7L);
            return 1;
        }).when(users).insert(any(SysUser.class));

        AuthResponse response = service.register(
            new RegisterRequest("fituser", "Test12345", "小练", true), "127.0.0.1");

        ArgumentCaptor<SysUser> saved = ArgumentCaptor.forClass(SysUser.class);
        verify(users).insert(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("fituser");
        assertThat(saved.getValue().getPasswordHash()).isEqualTo("bcrypt-hash");
        assertThat(saved.getValue().getRole()).isEqualTo("USER");
        assertThat(saved.getValue().getStatus()).isEqualTo(1);
        assertThat(response.token()).isEqualTo("jwt-token");
        assertThat(response.user().username()).isEqualTo("fituser");
        verify(rateLimiter).checkRegister("127.0.0.1");
    }

    @Test
    @DisplayName("注册失败：账号已存在返回 409001")
    void registerDuplicate() {
        when(users.selectCount(any())).thenReturn(1L);

        assertThatThrownBy(() -> service.register(
            new RegisterRequest("fituser", "Test12345", "", true), "127.0.0.1"))
            .isInstanceOf(AuthException.class)
            .satisfies(error -> assertThat(((AuthException) error).code()).isEqualTo(ResultCode.DUPLICATE));
    }

    @Test
    @DisplayName("注册并发：唯一索引冲突仍返回 409001，而不是 500")
    void registerConcurrentDuplicate() {
        when(users.selectCount(any())).thenReturn(0L);
        when(encoder.encode("Test12345")).thenReturn("bcrypt-hash");
        doThrow(new DuplicateKeyException("uk_users_username"))
            .when(users).insert(any(SysUser.class));

        assertThatThrownBy(() -> service.register(
            new RegisterRequest("fituser", "Test12345", "", true), "127.0.0.1"))
            .isInstanceOf(AuthException.class)
            .satisfies(error -> assertThat(((AuthException) error).code()).isEqualTo(ResultCode.DUPLICATE));
    }

    @Test
    @DisplayName("登录成功：更新最近登录时间")
    void loginSuccess() {
        SysUser user = user(3L, "fituser", 1, "USER");
        user.setPasswordHash("bcrypt-hash");
        when(users.selectOne(any())).thenReturn(user);
        when(encoder.matches("Test12345", "bcrypt-hash")).thenReturn(true);

        AuthResponse response = service.login(new LoginRequest("fituser", "Test12345"), "127.0.0.1");

        assertThat(response.token()).isEqualTo("jwt-token");
        assertThat(response.user().id()).isEqualTo(3L);
        verify(users).update(eq(null), any());
        verify(rateLimiter).resetLogin("127.0.0.1", "fituser");
    }

    @Test
    @DisplayName("登录失败：密码不匹配返回 401002")
    void loginWrongPassword() {
        SysUser user = user(3L, "fituser", 1, "USER");
        user.setPasswordHash("bcrypt-hash");
        when(users.selectOne(any())).thenReturn(user);
        when(encoder.matches("wrong-pass", "bcrypt-hash")).thenReturn(false);

        assertThatThrownBy(() -> service.login(new LoginRequest("fituser", "wrong-pass"), "127.0.0.1"))
            .isInstanceOf(AuthException.class)
            .satisfies(error -> assertThat(((AuthException) error).code()).isEqualTo(ResultCode.BAD_CREDENTIALS));
    }

    @Test
    @DisplayName("登录失败：停用账号返回 401003")
    void loginDisabled() {
        SysUser user = user(3L, "fituser", 0, "USER");
        user.setPasswordHash("bcrypt-hash");
        when(users.selectOne(any())).thenReturn(user);
        when(encoder.matches("Test12345", "bcrypt-hash")).thenReturn(true);

        assertThatThrownBy(() -> service.login(new LoginRequest("fituser", "Test12345"), "127.0.0.1"))
            .isInstanceOf(AuthException.class)
            .satisfies(error -> assertThat(((AuthException) error).code()).isEqualTo(ResultCode.ACCOUNT_DISABLED));
    }

    @Test
    @DisplayName("改密成功：旧令牌进黑名单并换发新令牌")
    void changePasswordSuccess() {
        SysUser user = user(3L, "fituser", 1, "USER");
        user.setPasswordHash("old-hash");
        when(users.selectById(3L)).thenReturn(user);
        when(encoder.matches("OldPass123", "old-hash")).thenReturn(true);
        when(encoder.matches("NewPass123", "old-hash")).thenReturn(false);
        when(encoder.encode("NewPass123")).thenReturn("new-hash");
        when(users.update(eq(null), any())).thenReturn(1);

        AuthResponse response = service.changePassword(
            principal(3L), new ChangePasswordRequest("OldPass123", "NewPass123", "NewPass123"));

        assertThat(response.token()).isEqualTo("jwt-token");
        verify(blacklist).blacklist(eq("jti"), any());
    }

    @Test
    @DisplayName("改密失败：原密码错误")
    void changePasswordWrongOld() {
        SysUser user = user(3L, "fituser", 1, "USER");
        user.setPasswordHash("old-hash");
        when(users.selectById(3L)).thenReturn(user);
        when(encoder.matches("bad-old", "old-hash")).thenReturn(false);

        assertThatThrownBy(() -> service.changePassword(
            principal(3L), new ChangePasswordRequest("bad-old", "NewPass123", "NewPass123")))
            .isInstanceOf(AuthException.class)
            .satisfies(error -> assertThat(((AuthException) error).code()).isEqualTo(ResultCode.BAD_CREDENTIALS));
    }

    @Test
    @DisplayName("改密失败：新密码与原密码相同")
    void changePasswordSame() {
        SysUser user = user(3L, "fituser", 1, "USER");
        user.setPasswordHash("old-hash");
        when(users.selectById(3L)).thenReturn(user);
        when(encoder.matches("OldPass123", "old-hash")).thenReturn(true);

        assertThatThrownBy(() -> service.changePassword(
            principal(3L), new ChangePasswordRequest("OldPass123", "OldPass123", "OldPass123")))
            .isInstanceOf(AuthException.class)
            .satisfies(error -> assertThat(((AuthException) error).code()).isEqualTo(ResultCode.PARAM_INVALID));
    }

    private static SysUser user(long id, String username, int status, String role) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setUsername(username);
        user.setNickname(username);
        user.setStatus(status);
        user.setRole(role);
        user.setPlan("free");
        return user;
    }

    private static AuthUser principal(long id) {
        return new AuthUser(id, null, "fituser", "小练", "USER", "free",
            null, null, null, "jti", Instant.now().plusSeconds(600));
    }
}
