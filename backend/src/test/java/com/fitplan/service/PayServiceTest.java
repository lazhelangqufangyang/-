package com.fitplan.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PayServiceTest {

    @Test
    @DisplayName("元与分互转不产生浮点误差")
    void centConversion() {
        assertThat(PayService.toCent(8)).isEqualTo(800);
        assertThat(PayService.toCent(8.88)).isEqualTo(888);
        assertThat(PayService.fromCent(800)).isEqualTo("8.00");
        assertThat(PayService.fromCent(888)).isEqualTo("8.88");
    }

    @Test
    @DisplayName("订单不存在不发货")
    void settleMissingOrder() {
        PayService.Verdict verdict = PayService.settle(notify("T1", "8.00", "TRADE_SUCCESS"), null);
        assertThat(verdict.pay()).isFalse();
        assertThat(verdict.why()).contains("库里没有这单");
    }

    @Test
    @DisplayName("已发货订单按重复通知处理")
    void settleDuplicate() {
        PayService.Verdict verdict = PayService.settle(
            notify("T1", "8.00", "TRADE_SUCCESS"), order("paid", 800));
        assertThat(verdict.pay()).isFalse();
        assertThat(verdict.duplicate()).isTrue();
    }

    @Test
    @DisplayName("金额一致且交易成功才发货")
    void settlePaid() {
        PayService.Verdict verdict = PayService.settle(
            notify("T1", "8.00", "TRADE_SUCCESS"), order("created", 800));
        assertThat(verdict.pay()).isTrue();
    }

    @Test
    @DisplayName("金额不一致不发货并标记异常")
    void settleMismatch() {
        PayService.Verdict verdict = PayService.settle(
            notify("T1", "0.01", "TRADE_SUCCESS"), order("created", 800));
        assertThat(verdict.pay()).isFalse();
        assertThat(verdict.mismatch()).isTrue();
    }

    @Test
    @DisplayName("交易关闭时关闭订单")
    void settleClosed() {
        PayService.Verdict verdict = PayService.settle(
            notify("T1", "8.00", "TRADE_CLOSED"), order("created", 800));
        assertThat(verdict.pay()).isFalse();
        assertThat(verdict.close()).isTrue();
    }

    private static Map<String, String> notify(String outTradeNo, String amount, String status) {
        Map<String, String> params = new HashMap<>();
        params.put("out_trade_no", outTradeNo);
        params.put("total_amount", amount);
        params.put("trade_status", status);
        return params;
    }

    private static Map<String, Object> order(String status, long amountCent) {
        return Map.of("status", status, "amount_cent", amountCent);
    }
}
