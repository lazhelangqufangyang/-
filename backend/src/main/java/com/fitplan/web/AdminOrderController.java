package com.fitplan.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitplan.config.ApiException;
import com.fitplan.service.AccountService;
import com.fitplan.service.AdminAuditService;
import com.fitplan.service.JsonUtil;
import com.fitplan.service.OrderSyncService;
import com.fitplan.service.RefundService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** 管理端订单动作：M2 只有主动查单；列表/退款等按里程碑继续加。 */
@RestController
public class AdminOrderController {

    private final AccountService account;
    private final OrderSyncService sync;
    private final AdminAuditService audit;
    private final RefundService refund;

    public AdminOrderController(AccountService account, OrderSyncService sync,
                                AdminAuditService audit, RefundService refund) {
        this.account = account;
        this.sync = sync;
        this.audit = audit;
        this.refund = refund;
    }

    /**
     * 主动查单：通知丢了以后，管理员用它把订单推到 paid。
     * 查单真的发货了才写审计；重复查、金额不符、未支付都不写变更记录。
     */
    @PostMapping("/api/admin/orders/{outTradeNo}/sync")
    @SuppressWarnings("unchecked")
    public Map<String, Object> syncOrder(@PathVariable String outTradeNo,
                                         @RequestBody(required = false) JsonNode body,
                                         HttpServletRequest request) {
        Map<String, Object> order = account.getOrder(outTradeNo);
        if (order == null) {
            throw new ApiException(404, "没有这个订单");
        }
        if (!sync.tryAcquire(outTradeNo, 3)) {
            throw new ApiException(429, "查得太勤了，3 秒后再试。");
        }
        long userId = ((Number) order.get("user_id")).longValue();
        Map<String, Object> before = planSnapshot(account.userPlanRow(userId));
        OrderSyncService.SyncOutcome outcome = sync.sync(order);
        Map<String, Object> after = planSnapshot(account.userPlanRow(userId));

        if (outcome.changed()) {
            Map<String, Object> session = (Map<String, Object>) request.getAttribute("fitplan.admin");
            String note = JsonUtil.text(body, "note");
            String reason = note == null || note.isBlank()
                ? "主动查单：" + outcome.verdict()
                : note.trim();
            audit.record(
                ((Number) session.get("id")).longValue(),
                String.valueOf(session.get("login_name")),
                "sync_deliver", outTradeNo, userId, before, after, reason);
        }

        Map<String, Object> freshUser = account.userPlanRow(userId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("changed", outcome.changed());
        out.put("alipayStatus", outcome.alipayStatus());
        out.put("verdict", outcome.verdict());
        out.put("amountMatch", outcome.amountMatch());
        out.put("status", String.valueOf(account.getOrder(outTradeNo).get("status")));
        out.put("plan", account.planState(freshUser));
        out.put("expiresAt", JsonUtil.iso(freshUser == null ? null : freshUser.get("plan_expires_at")));
        return out;
    }

    /**
     * 全额退款：支付宝确认退钱之后才动本地权益；重复退款在服务层就被 409 拦下。
     * 成功落账后写审计（原因必填，2–200 字）。
     */
    @PostMapping("/api/admin/orders/{outTradeNo}/refund")
    @SuppressWarnings("unchecked")
    public Map<String, Object> refundOrder(@PathVariable String outTradeNo,
                                           @RequestBody(required = false) JsonNode body,
                                           HttpServletRequest request) {
        Map<String, Object> order = account.getOrder(outTradeNo);
        if (order == null) {
            throw new ApiException(404, "没有这个订单");
        }
        String reason = reasonOf(body);
        long userId = ((Number) order.get("user_id")).longValue();
        Map<String, Object> before = planSnapshot(account.userPlanRow(userId));
        RefundService.RefundOutcome outcome = refund.refund(order, reason);
        if (!outcome.completed()) {
            throw new ApiException(409, "这单已经退过款了。");
        }
        Map<String, Object> after = planSnapshot(account.userPlanRow(userId));
        Map<String, Object> session = (Map<String, Object>) request.getAttribute("fitplan.admin");
        audit.record(
            ((Number) session.get("id")).longValue(),
            String.valueOf(session.get("login_name")),
            "refund", outTradeNo, userId, before, after, reason);
        return refundState(outTradeNo, userId, outcome.refundCent(), "refunded");
    }

    /** 退款结果未知时的对账入口：支付宝说退成功、本地还没记，就把本地补上并扣天 */
    @PostMapping("/api/admin/orders/{outTradeNo}/refund-query")
    @SuppressWarnings("unchecked")
    public Map<String, Object> refundQuery(@PathVariable String outTradeNo, HttpServletRequest request) {
        Map<String, Object> order = account.getOrder(outTradeNo);
        if (order == null) {
            throw new ApiException(404, "没有这个订单");
        }
        long userId = ((Number) order.get("user_id")).longValue();
        Map<String, Object> before = planSnapshot(account.userPlanRow(userId));
        RefundService.RefundQueryOutcome outcome = refund.queryRefund(order);
        if (outcome.completed()) {
            Map<String, Object> after = planSnapshot(account.userPlanRow(userId));
            Map<String, Object> session = (Map<String, Object>) request.getAttribute("fitplan.admin");
            audit.record(
                ((Number) session.get("id")).longValue(),
                String.valueOf(session.get("login_name")),
                "refund", outTradeNo, userId, before, after,
                "退款查询：支付宝返回 " + outcome.alipayRefundStatus());
        }
        Map<String, Object> freshOrder = account.getOrder(outTradeNo);
        Map<String, Object> freshUser = account.userPlanRow(userId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("alipayRefundStatus", outcome.alipayRefundStatus());
        out.put("refundSuccess", outcome.refundSuccess());
        out.put("changed", outcome.completed());
        out.put("refundStatus", String.valueOf(freshOrder.get("refund_status")));
        out.put("plan", account.planState(freshUser));
        out.put("expiresAt", JsonUtil.iso(freshUser == null ? null : freshUser.get("plan_expires_at")));
        return out;
    }

    private Map<String, Object> refundState(String outTradeNo, long userId, int refundCent, String refundStatus) {
        Map<String, Object> freshOrder = account.getOrder(outTradeNo);
        Map<String, Object> freshUser = account.userPlanRow(userId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("refunded", true);
        out.put("refundStatus", refundStatus);
        out.put("refundCent", refundCent);
        out.put("refundedAt", JsonUtil.iso(freshOrder.get("refunded_at")));
        out.put("status", String.valueOf(freshOrder.get("status")));
        out.put("plan", account.planState(freshUser));
        out.put("expiresAt", JsonUtil.iso(freshUser == null ? null : freshUser.get("plan_expires_at")));
        return out;
    }

    private static String reasonOf(JsonNode body) {
        String reason = JsonUtil.text(body, "reason");
        String trimmed = reason == null ? "" : reason.trim();
        if (trimmed.length() < 2 || trimmed.length() > 200) {
            throw new ApiException(400, "退款原因必须填，2–200 字。");
        }
        return trimmed;
    }

    private static Map<String, Object> planSnapshot(Map<String, Object> user) {
        if (user == null) {
            return null;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("plan", user.get("plan"));
        out.put("expiresAt", JsonUtil.iso(user.get("plan_expires_at")));
        return out;
    }
}