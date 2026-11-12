package com.fitplan.web;

import com.fitplan.config.FitplanProperties;
import com.fitplan.service.AccountService;
import com.fitplan.service.AlipayClient;
import com.fitplan.service.PayService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    private final AccountService account;
    private final AlipayClient alipay;
    private final PayService pay;
    private final FitplanProperties props;

    public HealthController(AccountService account, AlipayClient alipay, PayService pay, FitplanProperties props) {
        this.account = account;
        this.alipay = alipay;
        this.pay = pay;
        this.props = props;
    }

    /**
     * 这个接口不带令牌就能读，所以默认只回三样状态。
     * 缺哪些环境变量、CORS 白名单里有谁，是排查时才要看的东西 —— 打开 FITPLAN_HEALTH_DETAIL=1 再回，
     * 挂着隧道对外时关掉，别让陌生人看见这台服务还没配什么。
     */
    @GetMapping("/api/health")
    public Map<String, Object> health() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("db", account.dbUp() ? "up" : "down");
        out.put("alipay", state(alipay.alipayMissing()));
        out.put("pay", state(pay.payMissing()));
        if (props.isHealthDetail()) {
            out.put("alipayMissing", alipay.alipayMissing());
            out.put("payMissing", pay.payMissing());
            out.put("origins", props.resolvedOrigins());
        }
        return out;
    }

    private static String state(List<String> missing) {
        return missing.isEmpty() ? "configured" : "not_configured";
    }
}
