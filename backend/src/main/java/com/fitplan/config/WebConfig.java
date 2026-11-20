package com.fitplan.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AdminGuard adminGuard;

    public WebConfig(AdminGuard adminGuard) {
        this.adminGuard = adminGuard;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(adminGuard)
            .addPathPatterns("/api/admin/**")
            // 登录接口自己处理「管理端未启用」和限流；其余全部先过守卫
            .excludePathPatterns("/api/admin/auth/login");
    }
}