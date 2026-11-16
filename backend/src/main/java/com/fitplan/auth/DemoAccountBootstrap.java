package com.fitplan.auth;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fitplan.auth.entity.SysUser;
import com.fitplan.auth.mapper.SysUserMapper;
import com.fitplan.config.FitplanProperties;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** 仅当 DEMO_LOGIN_ENABLED=true 时创建两个免密体验账号；已存在则不动，停用状态也不会被重置。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DemoAccountBootstrap implements ApplicationRunner {

    private final SysUserMapper users;
    private final PasswordEncoder passwordEncoder;
    private final FitplanProperties props;

    @Override
    public void run(ApplicationArguments args) {
        if (!props.getAuth().isDemoLogin()) {
            return;
        }
        createIfMissing(DemoAccounts.USERNAMES.get(DemoAccounts.USER), DemoAccounts.LABELS.get(DemoAccounts.USER), "USER");
        createIfMissing(DemoAccounts.USERNAMES.get(DemoAccounts.ADMIN), DemoAccounts.LABELS.get(DemoAccounts.ADMIN), "ADMIN");
    }

    private void createIfMissing(String username, String nickname, String role) {
        Long exists = users.selectCount(new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
        if (exists != null && exists > 0) {
            return;
        }
        SysUser user = new SysUser();
        user.setUsername(username);
        // 随机密码：账号只能走快捷登录，不能拿密码从普通登录入口进来
        user.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString()));
        user.setNickname(StrUtil.blankToDefault(nickname, username));
        user.setRole(role);
        user.setStatus(1);
        user.setPlan("free");
        users.insert(user);
        log.info("[demo] 已创建体验账号 {}（{}）", username, role);
    }
}
