package com.fitplan.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 主动查单：以支付宝那边的事实为准，兜底异步通知丢失。
 * 金额一律按「分」和订单表里的 amount_cent 比，不一致就不发货。
 */
@Service
public class OrderSyncService {

    private static final Logger log = LoggerFactory.getLogger(OrderSyncService.class);
    private static final int MAX_KEYS = 5000;

    private final AlipayClient alipay;
    private final AccountService account;
    /** 每次查单都会真的打支付宝网关，这里按订单号做冷却，防止被轮询打爆 */
    private final Map<String, Long> lastQueryMs = new ConcurrentHashMap<>();

    public OrderSyncService(AlipayClient alipay, AccountService account) {
        this.alipay = alipay;
        this.account = account;
    }

    /** 冷却期没过的返回 false；过期键在表太大时顺手清掉 */
    public boolean tryAcquire(String outTradeNo, int cooldownSeconds) {
        long now = System.currentTimeMillis();
        Long previous = lastQueryMs.get(outTradeNo);
        if (previous != null && now - previous < cooldownSeconds * 1000L) {
            return false;
        }
        if (lastQueryMs.size() > MAX_KEYS) {
            lastQueryMs.entrySet().removeIf(entry -> now - entry.getValue() > 60_000L);
        }
        lastQueryMs.put(outTradeNo, now);
        return true;
    }

    public SyncOutcome sync(Map<String, Object> order) {
        String outTradeNo = String.valueOf(order.get("out_trade_no"));
        JsonNode result = alipay.tradeQuery(outTradeNo);
        String alipayStatus = text(result, "trade_status");
        String tradeNo = text(result, "trade_no");
        String buyerId = text(result, "buyer_user_id");
        if (buyerId == null || buyerId.isBlank()) {
            buyerId = text(result, "buyer_id");
        }
        long storedCent = ((Number) order.get("amount_cent")).longValue();
        Long notifiedCent = centOf(text(result, "total_amount"));
        boolean amountMatch = notifiedCent != null && notifiedCent == storedCent;

        boolean changed = false;
        String verdict;
        if ("TRADE_SUCCESS".equals(alipayStatus) || "TRADE_FINISHED".equals(alipayStatus)) {
            if (!amountMatch) {
                verdict = "金额对不上：支付宝 " + text(result, "total_amount") + " 元，订单 "
                    + PayService.fromCent(storedCent) + " 元";
            } else {
                changed = account.deliverPaid(outTradeNo, tradeNo, buyerId);
                verdict = changed ? "查单发货完成" : "这单已经发过货了";
            }
        } else if ("TRADE_CLOSED".equals(alipayStatus)) {
            account.closeOrder(outTradeNo);
            verdict = "交易已关闭";
        } else {
            verdict = "支付宝状态 " + alipayStatus + "，还不算付成功";
        }
        log.info("[pay] 查单 {} {}：{}（{}）", outTradeNo, changed ? "已发货" : "未变更", alipayStatus, verdict);
        return new SyncOutcome(changed, alipayStatus, verdict, amountMatch, tradeNo, buyerId);
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private static Long centOf(String yuan) {
        if (yuan == null || yuan.isEmpty()) {
            return null;
        }
        try {
            return Math.round(Double.parseDouble(yuan) * 100);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public record SyncOutcome(boolean changed, String alipayStatus, String verdict,
                              boolean amountMatch, String tradeNo, String buyerId) {
    }
}