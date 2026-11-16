package com.fitplan.testsupport;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fitplan.auth.entity.SysUser;
import org.apache.ibatis.builder.MapperBuilderAssistant;

/** 纯单元测试没有 Spring 容器，MyBatis-Plus 的 Lambda 条件需要手动初始化表元数据。 */
public final class MybatisTestSupport {

    private static boolean ready;

    private MybatisTestSupport() {
    }

    public static synchronized void init() {
        if (ready) {
            return;
        }
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        assistant.setCurrentNamespace("com.fitplan.test");
        TableInfoHelper.initTableInfo(assistant, SysUser.class);
        ready = true;
    }
}
