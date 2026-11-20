package com.fitplan.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 管理端的只读查询：订单、用户元数据、审计。
 * 用户内容表（profiles / frameworks / set_logs / meal_logs …）在这里一行都不许出现。
 */
@Service
public class AdminDataService {

    private static final String ORDER_SELECT =
        "SELECT o.out_trade_no, o.user_id, o.days, o.amount_cent, o.status, o.trade_no, o.buyer_id,"
            + " o.refund_status, o.refund_cent, o.refunded_at, o.created_at, o.paid_at,"
            + " u.login_name, u.alipay_uid, u.plan AS user_plan, u.plan_expires_at"
            + " FROM orders o JOIN users u ON u.id = o.user_id";

    private static final String USER_SELECT =
        "SELECT u.id, u.login_name, u.alipay_uid, u.plan, u.plan_expires_at, u.created_at, u.last_login_at,"
            + " (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') AS paid_orders"
            + " FROM users u";

    private final JdbcTemplate jdbc;

    public AdminDataService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public QueryResult orders(String status, String q, int limit, int offset) {
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (status != null && !status.isBlank()) {
            where.append(" AND o.status = ?");
            args.add(status.trim());
        }
        if (q != null && !q.isBlank()) {
            where.append(" AND (o.out_trade_no LIKE ? OR o.trade_no LIKE ? OR u.login_name LIKE ?"
                + " OR u.alipay_uid LIKE ?)");
            String like = "%" + q.trim() + "%";
            args.add(like);
            args.add(like);
            args.add(like);
            args.add(like);
        }
        Integer total = jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders o JOIN users u ON u.id = o.user_id" + where,
            Integer.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(safeLimit(limit));
        pageArgs.add(safeOffset(offset));
        List<Map<String, Object>> rows = jdbc.queryForList(
            ORDER_SELECT + where + " ORDER BY o.created_at DESC, o.out_trade_no DESC LIMIT ? OFFSET ?",
            pageArgs.toArray());
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            items.add(orderRow(row));
        }
        return new QueryResult(items, total == null ? 0 : total);
    }

    public Map<String, Object> order(String outTradeNo) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            ORDER_SELECT + " WHERE o.out_trade_no = ? LIMIT 1", outTradeNo);
        if (rows.isEmpty()) {
            return null;
        }
        Map<String, Object> out = orderRow(rows.get(0));
        out.put("audits", auditsForOrder(outTradeNo));
        return out;
    }

    public QueryResult users(String q, int limit, int offset) {
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (q != null && !q.isBlank()) {
            where.append(" AND (u.login_name LIKE ? OR u.alipay_uid LIKE ?)");
            String like = "%" + q.trim() + "%";
            args.add(like);
            args.add(like);
        }
        Integer total = jdbc.queryForObject(
            "SELECT COUNT(*) FROM users u" + where, Integer.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(safeLimit(limit));
        pageArgs.add(safeOffset(offset));
        List<Map<String, Object>> rows = jdbc.queryForList(
            USER_SELECT + where + " ORDER BY u.id DESC LIMIT ? OFFSET ?", pageArgs.toArray());
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", number(row.get("id")));
            item.put("loginName", row.get("login_name"));
            item.put("uidTail", tail(row.get("alipay_uid")));
            item.put("plan", row.get("plan"));
            item.put("expiresAt", JsonUtil.iso(row.get("plan_expires_at")));
            item.put("createdAt", JsonUtil.iso(row.get("created_at")));
            item.put("lastLoginAt", JsonUtil.iso(row.get("last_login_at")));
            item.put("paidOrders", number(row.get("paid_orders")));
            items.add(item);
        }
        return new QueryResult(items, total == null ? 0 : total);
    }

    public QueryResult audits(int limit, int offset) {
        Integer total = jdbc.queryForObject("SELECT COUNT(*) FROM admin_audit", Integer.class);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT id, admin_login, action, out_trade_no, target_user_id, before_json, after_json,"
                + " reason, created_at FROM admin_audit ORDER BY id DESC LIMIT ? OFFSET ?",
            safeLimit(limit), safeOffset(offset));
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            items.add(auditRow(row));
        }
        return new QueryResult(items, total == null ? 0 : total);
    }

    public List<Map<String, Object>> auditsForOrder(String outTradeNo) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT id, admin_login, action, out_trade_no, target_user_id, before_json, after_json,"
                + " reason, created_at FROM admin_audit WHERE out_trade_no = ? ORDER BY id DESC",
            outTradeNo);
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            items.add(auditRow(row));
        }
        return items;
    }

    private static Map<String, Object> orderRow(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("outTradeNo", row.get("out_trade_no"));
        out.put("userId", number(row.get("user_id")));
        out.put("loginName", row.get("login_name"));
        out.put("uidTail", tail(row.get("alipay_uid")));
        out.put("days", number(row.get("days")));
        out.put("amountCent", number(row.get("amount_cent")));
        Object cent = row.get("amount_cent");
        out.put("amountYuan", cent instanceof Number number
            ? PayService.fromCent(number.longValue()) : null);
        out.put("status", row.get("status"));
        out.put("tradeNo", row.get("trade_no"));
        out.put("buyerId", row.get("buyer_id"));
        out.put("refundStatus", row.get("refund_status"));
        Object refundCent = row.get("refund_cent");
        out.put("refundCent", refundCent instanceof Number number ? number.longValue() : null);
        out.put("refundedAt", JsonUtil.iso(row.get("refunded_at")));
        out.put("createdAt", JsonUtil.iso(row.get("created_at")));
        out.put("paidAt", JsonUtil.iso(row.get("paid_at")));
        out.put("userPlan", row.get("user_plan"));
        out.put("planExpiresAt", JsonUtil.iso(row.get("plan_expires_at")));
        return out;
    }

    private static Map<String, Object> auditRow(Map<String, Object> row) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", number(row.get("id")));
        item.put("adminLogin", row.get("admin_login"));
        item.put("action", row.get("action"));
        item.put("outTradeNo", row.get("out_trade_no"));
        item.put("targetUserId", number(row.get("target_user_id")));
        item.put("before", json(row.get("before_json")));
        item.put("after", json(row.get("after_json")));
        item.put("reason", row.get("reason"));
        item.put("createdAt", JsonUtil.iso(row.get("created_at")));
        return item;
    }

    private static JsonNode json(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return JsonUtil.MAPPER.readTree(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }

    private static Long number(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }

    private static String tail(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value);
        return text.length() <= 4 ? text : text.substring(text.length() - 4);
    }

    private static int safeLimit(int limit) {
        return Math.max(1, Math.min(limit <= 0 ? 50 : limit, 100));
    }

    private static int safeOffset(int offset) {
        return Math.max(0, offset);
    }

    public record QueryResult(List<Map<String, Object>> items, int total) {
    }
}