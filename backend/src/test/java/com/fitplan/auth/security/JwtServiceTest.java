package com.fitplan.auth.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fitplan.config.FitplanProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JwtServiceTest {

    @Test
    @DisplayName("签发的 JWT 能解析出用户 ID 与 jti")
    void issueAndParse() {
        FitplanProperties props = new FitplanProperties();
        props.getAuth().setJwtSecret("fitplan-test-secret-0123456789abcdef");
        props.getAuth().setExpireMinutes(120);
        JwtService jwt = new JwtService(props);

        JwtService.Issued issued = jwt.issue(9L);

        assertThat(issued.token()).isNotBlank();
        assertThat(jwt.parse(issued.token()).getSubject()).isEqualTo("9");
        assertThat(jwt.parse(issued.token()).getId()).isNotBlank();
        assertThat(jwt.expiresInSeconds()).isEqualTo(7200);
    }

    @Test
    @DisplayName("密钥不足 32 位时拒绝启动")
    void shortSecretRejected() {
        FitplanProperties props = new FitplanProperties();
        props.getAuth().setJwtSecret("too-short");

        assertThatThrownBy(() -> new JwtService(props))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("至少需要 32 个字符");
    }
}
