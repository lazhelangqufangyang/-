package com.fitplan.auth.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

@ExtendWith(MockitoExtension.class)
class TokenBlacklistTest {

    @Mock
    StringRedisTemplate redis;
    @Mock
    ValueOperations<String, String> ops;

    TokenBlacklist blacklist;

    @BeforeEach
    void setUp() {
        blacklist = new TokenBlacklist(redis);
    }

    @Test
    @DisplayName("登出时按剩余有效期写入 Redis 黑名单")
    void blacklistWithTtl() {
        when(redis.opsForValue()).thenReturn(ops);

        blacklist.blacklist("jti-1", Instant.now().plusSeconds(120));

        verify(ops).set(eq("auth:blacklist:jti-1"), eq("1"), any(java.time.Duration.class));
    }

    @Test
    @DisplayName("已过期令牌不写黑名单")
    void expiredTokenSkipped() {
        blacklist.blacklist("jti-1", Instant.now().minusSeconds(10));

        verifyNoInteractions(redis);
    }

    @Test
    @DisplayName("Redis 不可用时 fail-open，不影响登出")
    void failOpen() {
        when(redis.opsForValue()).thenThrow(new RuntimeException("redis down"));

        assertThatCode(() -> blacklist.blacklist("jti-1", Instant.now().plusSeconds(60)))
            .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("黑名单命中返回 true")
    void isBlacklisted() {
        when(redis.hasKey("auth:blacklist:jti-1")).thenReturn(true);

        assertThat(blacklist.isBlacklisted("jti-1")).isTrue();
        assertThat(blacklist.isBlacklisted("")).isFalse();
    }
}
