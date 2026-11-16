package com.fitplan.auth.security;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.fitplan.auth.common.AuthException;
import com.fitplan.auth.common.ResultCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

@ExtendWith(MockitoExtension.class)
class LoginRateLimiterTest {

    @Mock
    StringRedisTemplate redis;
    @Mock
    ValueOperations<String, String> ops;

    LoginRateLimiter limiter;

    @BeforeEach
    void setUp() {
        limiter = new LoginRateLimiter(redis);
    }

    @Test
    @DisplayName("同一 IP + 账号一分钟内第 6 次请求被拒绝")
    void limitByRedis() {
        when(redis.opsForValue()).thenReturn(ops);
        when(ops.increment(anyString())).thenReturn(1L, 2L, 3L, 4L, 5L, 6L);

        for (int i = 0; i < 5; i += 1) {
            assertThatCode(() -> limiter.checkLogin("127.0.0.1", "fituser")).doesNotThrowAnyException();
        }
        assertThatThrownBy(() -> limiter.checkLogin("127.0.0.1", "fituser"))
            .isInstanceOf(AuthException.class)
            .satisfies(error -> org.assertj.core.api.Assertions
                .assertThat(((AuthException) error).code()).isEqualTo(ResultCode.TOO_MANY_REQUESTS));
    }

    @Test
    @DisplayName("Redis 不可用时退回内存计数并仍能限流")
    void fallbackToMemory() {
        lenient().when(redis.opsForValue()).thenReturn(ops);
        when(ops.increment(anyString())).thenThrow(new RuntimeException("redis down"));

        for (int i = 0; i < 5; i += 1) {
            assertThatCode(() -> limiter.checkLogin("10.0.0.1", "fituser")).doesNotThrowAnyException();
        }
        assertThatThrownBy(() -> limiter.checkLogin("10.0.0.1", "fituser"))
            .isInstanceOf(AuthException.class);
    }

    @Test
    @DisplayName("Redis 故障时内存计数有上限，随机账号不会撑爆 Map")
    void fallbackMapBounded() {
        when(redis.opsForValue()).thenReturn(ops);
        when(ops.increment(anyString())).thenThrow(new RuntimeException("redis down"));

        for (int i = 0; i < LoginRateLimiter.FALLBACK_MAX_KEYS; i += 1) {
            limiter.checkLogin("10.2.0.1", "user" + i);
        }

        assertThatThrownBy(() -> limiter.checkLogin("10.2.0.1", "overflow"))
            .isInstanceOf(AuthException.class)
            .satisfies(error -> org.assertj.core.api.Assertions
                .assertThat(((AuthException) error).code()).isEqualTo(ResultCode.TOO_MANY_REQUESTS));
    }

    @Test
    @DisplayName("登录成功后重置计数")
    void resetAfterSuccess() {
        limiter.resetLogin("127.0.0.1", "fituser");
        assertThatCode(() -> limiter.resetLogin("127.0.0.1", "fituser")).doesNotThrowAnyException();
    }
}
