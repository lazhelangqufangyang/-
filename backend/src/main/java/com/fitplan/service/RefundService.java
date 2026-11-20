package com.fitplan.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitplan.config.ApiException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 全额退款（V1）：支付宝确认退钱之后，本地才动权益。
 * 退款是「退哪单扣哪单的天数」，从当前到期日往前扣，扣到当天为止就降免费。
 */
@Service
public class RefundService {

    private static final Logger log = LoggerFactory.getLogger(RefundService.class);

    private final AlipayClient alipay;
    private final JdbcTemplate jdbc;

    public RefundService(AlipayClient alipay, JdbcTemplate jdbc) {
        this.alipay = alipay;
        this.jdbc = jdbc;
    }

    public RefundOutcome refund(Map<String, Object> order, String reason) {
        String outTradeNo = String.valueOf(order.get("out_trade_no"));
        String status = String.valueOf(order.get("status"));
        String refundStatus = order.get("refund_status") == null ? "none" : String.valueOf(order.get("refund_status"));
        if (!"paid".equals(status)) {
            throw new ApiException(409, "这单还没付款，不能退款。");
        }
        if (!"none".equals(refundStatus)) {
            throw new ApiException(409, "这单已经退过款了。");
        }
        int amountCent = ((Number) order.get("amount_cent")).intValue();
        JsonNode result = alipay.tradeRefund(outTradeNo, amountCent, reason, outTradeNo);
        String fundChange = text(result, "fund_change");
        String refundFee = text(result, "refund_fee");
        boolean confirmed = "Y".equalsIgnoreCase(fundChange) || (refundFee != null && !refundFee.isBlank());
        if (!confirmed) {
            // 网关回了成功但钱没动（例如同一 out_request_no 已退过且没带金额）：权益不能动
            throw new ApiException(502, "支付宝没有确认退款（fund_change=" + fundChange + "），本地权益没动。");
        }
        boolean completed = completeRefund(order, amountCent, reason);
        return new RefundOutcome(completed, amountCent, fundChange, refundFee);
    }

    /** 退款查询：退款调用结果未知时，以支付宝的退款状态为准；确认已退就把本地补上 */
    public RefundQueryOutcome queryRefund(Map<String, Object> order) {
        String outTradeNo = String.valueOf(order.get("out_trade_no"));
        String status = String.valueOf(order.get("status"));
        if (!"paid".equals(status)) {
            throw new ApiException(409, "这单还没付款，没有可查的退款。");
        }
        JsonNode result = alipay.refundQuery(outTradeNo, outTradeNo);
        String alipayRefundStatus = text(result, "refund_status");
        boolean success = "REFUND_SUCCESS".equalsIgnoreCase(alipayRefundStatus);
        boolean completed = false;
        String localRefundStatus = order.get("refund_status") == null ? "none" : String.valueOf(order.get("refund_status"));
        if (success && "none".equals(localRefundStatus)) {
            int amountCent = ((Number) order.get("amount_cent")).intValue();
            completed = completeRefund(order, amountCent, "退款查询：支付宝返回 REFUND_SUCCESS");
        }
        return new RefundQueryOutcome(alipayRefundStatus, completed, success);
    }

    /**
     * 本地落账：订单闸门只允许一次，然后把本单购买的天数从到期日里扣回去。
     * 用户叠加买过多单时，退哪单扣哪单的天数，不按先后推断。
     */
    @Transactional
    public boolean completeRefund(Map<String, Object> order, int refundCent, String reason) {
        String outTradeNo = String.valueOf(order.get("out_trade_no"));
        int hit = jdbc.update(
            "UPDATE orders SET refund_status = 'refunded', refund_cent = ?, refunded_at = NOW(),"
                + " refund_request_no = ? WHERE out_trade_no = ? AND refund_status = 'none' AND status = 'paid'",
            refundCent, outTradeNo, outTradeNo);
        if (hit == 0) {
            return false;
        }
        long userId = ((Number) order.get("user_id")).longValue();
        int days = ((Number) order.get("days")).intValue();
        jdbc.update(
            "UPDATE users SET plan_expires_at = DATE_SUB(plan_expires_at, INTERVAL ? DAY)"
                + " WHERE id = ? AND plan_expires_at IS NOT NULL",
            days, userId);
        jdbc.update(
            "UPDATE users SET plan = 'free', plan_expires_at = NULL"
                + " WHERE id = ? AND (plan_expires_at IS NULL OR plan_expires_at <= NOW())",
            userId);
        log.info("[pay] 已退款 {}（{} 分，{} 天），用户 {}", outTradeNo, refundCent, days, userId);
        return true;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    public record RefundOutcome(boolean completed, int refundCent, String fundChange, String refundFee) {
    }

    public record RefundQueryOutcome(String alipayRefundStatus, boolean completed, boolean refundSuccess) {
    }
}