package com.fitplan.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** 权益变更的唯一落痕点：谁、何时、对谁、改了什么、为什么。 */
@Service
public class AdminAuditService {

    private static final Logger log = LoggerFactory.getLogger(AdminAuditService.class);

    private final JdbcTemplate jdbc;

    public AdminAuditService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void record(long adminId, String adminLogin, String action, String outTradeNo,
                       Long targetUserId, Object before, Object after, String reason) {
        try {
            jdbc.update(
                "INSERT INTO admin_audit (admin_id, admin_login, action, out_trade_no, target_user_id,"
                    + " before_json, after_json, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                adminId, adminLogin, action, outTradeNo, targetUserId,
                json(before), json(after), reason);
        } catch (Exception e) {
            // 审计写不进去不能悄悄吞掉：这是钱相关操作的最后一道记录
            log.error("[admin] 审计写入失败：{} action={} order={} user={}",
                e.getMessage(), action, outTradeNo, targetUserId);
            throw e;
        }
    }

    private static String json(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return JsonUtil.MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            return "{\"serializeError\":true}";
        }
    }
}