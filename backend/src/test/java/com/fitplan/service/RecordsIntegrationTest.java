package com.fitplan.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitplan.auth.entity.SysUser;
import com.fitplan.auth.mapper.SysUserMapper;
import com.fitplan.config.ApiException;
import com.fitplan.config.DotEnv;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * 真实 MySQL 集成测试：默认跳过，设置 FITPLAN_IT=true 才执行。
 * 使用独立库 fitplan_it，不碰开发库 fitplan。
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "FITPLAN_IT", matches = "true")
class RecordsIntegrationTest {

    @DynamicPropertySource
    static void testDatabase(DynamicPropertyRegistry registry) {
        DotEnv.apply();
        String host = System.getProperty("MYSQL_HOST", "127.0.0.1");
        String port = System.getProperty("MYSQL_PORT", "3306");
        String user = System.getProperty("MYSQL_USER", "root");
        String password = System.getProperty("MYSQL_PASSWORD", "");
        String url = "jdbc:mysql://" + host + ":" + port + "/fitplan_it"
            + "?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai"
            + "&useSSL=false&allowPublicKeyRetrieval=true";
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> user);
        registry.add("spring.datasource.password", () -> password);
        registry.add("fitplan.auth.demo-login", () -> false);
        registry.add("ADMIN_USERNAME", () -> "");
    }

    @Autowired
    RecordsService records;
    @Autowired
    SysUserMapper users;
    @Autowired
    JdbcTemplate jdbc;

    SysUser user;

    @BeforeEach
    void createUser() {
        user = new SysUser();
        user.setUsername("it_" + System.nanoTime());
        user.setPasswordHash("test-hash");
        user.setNickname("集成测试");
        user.setRole("USER");
        user.setStatus(1);
        user.setPlan("free");
        users.insert(user);
    }

    @AfterEach
    void cleanUp() {
        if (user == null) {
            return;
        }
        records.clearRecords(user.getId());
        jdbc.update("DELETE FROM users WHERE id = ?", user.getId());
    }

    @Test
    @DisplayName("整份上传后能原样读回，并返回各表行数")
    void replaceAndRead() throws Exception {
        Map<String, Object> counts = records.replaceRecords(user.getId(), payload(fullJson()));

        assertThat(counts.get("profiles")).isEqualTo(1);
        assertThat(counts.get("frameworks")).isEqualTo(1);
        assertThat(counts.get("day_sheets")).isEqualTo(1);
        assertThat(counts.get("set_logs")).isEqualTo(1);
        assertThat(counts.get("meal_logs")).isEqualTo(1);
        assertThat(counts.get("measure_logs")).isEqualTo(1);

        Map<String, Object> back = records.readRecords(user.getId());
        assertThat(back).isNotNull();
        assertThat(back.get("profile")).isNotNull();
        assertThat(back.get("syncedAt")).isNotNull();
        assertThat((Iterable<?>) back.get("sheets")).hasSize(1);
        assertThat((Iterable<?>) back.get("setLogs")).hasSize(1);
        assertThat((Iterable<?>) back.get("mealLogs")).hasSize(1);
        assertThat((Iterable<?>) back.get("measureLogs")).hasSize(1);
    }

    @Test
    @DisplayName("再次上传整份覆盖：旧记录被删除")
    void replaceRemovesOldRows() throws Exception {
        records.replaceRecords(user.getId(), payload(fullJson()));

        Map<String, Object> counts = records.replaceRecords(user.getId(), payload(emptyJson()));

        assertThat(counts.get("day_sheets")).isEqualTo(0);
        assertThat(counts.get("set_logs")).isEqualTo(0);
        assertThat(counts.get("meal_logs")).isEqualTo(0);
        Map<String, Object> back = records.readRecords(user.getId());
        assertThat((Iterable<?>) back.get("sheets")).isEmpty();
        assertThat((Iterable<?>) back.get("mealLogs")).isEmpty();
    }

    @Test
    @DisplayName("缺少档案时拒绝覆盖")
    void rejectsMissingProfile() throws Exception {
        String json = "{\"sheets\":[],\"setLogs\":[],\"activityLogs\":[],\"mealLogs\":[],\"measureLogs\":[]}";

        assertThatThrownBy(() -> records.replaceRecords(user.getId(), payload(json)))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("没有档案");
    }

    @Test
    @DisplayName("非法餐次被拒绝")
    void rejectsUnknownMealSlot() throws Exception {
        String json = fullJson().replace("\"slot\":\"lunch\"", "\"slot\":\"brunch\"");

        assertThatThrownBy(() -> records.replaceRecords(user.getId(), payload(json)))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("时段不认得");
    }

    private static JsonNode payload(String json) throws Exception {
        return com.fitplan.service.JsonUtil.MAPPER.readTree(json);
    }

    private static String fullJson() {
        return """
            {
              "profile": {"sex":"male","age":28,"heightCm":178,"weightKg":72},
              "onboarded": true,
              "favorites": ["front-squat"],
              "framework": {"id":"fw-it","startDate":"2026-11-15","createdAt":"2026-11-15T10:00:00",
                "weeksTotal":4,"days":[],"weeks":[],"rules":[],"goal":null,"assumed":[]},
              "sheets": [{"id":"sheet-it-1","date":"2026-11-15","weekday":6,"focus":"胸",
                "budgetMinutes":60,"loadAdjustPct":0,"input":{},"slots":[],"overrides":{},
                "skipped":[],"assumed":[],"flags":[],"dropped":[],"createdAt":"2026-11-15T10:00:00"}],
              "setLogs": [{"sheetId":"sheet-it-1","slotId":"slot-1","setIdx":0,"exId":"front-squat",
                "date":"2026-11-15","weightKg":60,"reps":10,"targetReps":10,"rpe":8,
                "toFailure":false,"ts":"2026-11-15T10:10:00"}],
              "activityLogs": [],
              "mealLogs": [{"id":"meal-it-1","date":"2026-11-15","slot":"lunch","name":"鸡胸肉饭",
                "kcal":600,"proteinG":40,"carbsG":60,"fatG":15,"sugarG":5,"sodiumMg":800,
                "note":"","ts":"2026-11-15T12:00:00"}],
              "measureLogs": [{"id":"measure-it-1","date":"2026-11-15","weightKg":72,"waistCm":80,
                "note":"","ts":"2026-11-15T08:00:00"}]
            }
            """;
    }

    private static String emptyJson() {
        return """
            {
              "profile": {"sex":"male","age":28,"heightCm":178},
              "onboarded": true,
              "favorites": [],
              "framework": null,
              "sheets": [],
              "setLogs": [],
              "activityLogs": [],
              "mealLogs": [],
              "measureLogs": []
            }
            """;
    }
}
