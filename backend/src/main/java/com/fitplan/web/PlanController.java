package com.fitplan.web;

import com.fitplan.config.FitplanProperties;
import com.fitplan.service.AccountService;
import com.fitplan.service.JsonUtil;
import com.fitplan.service.PayService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PlanController {

    private final AccountService account;
    private final PayService pay;
    private final FitplanProperties props;

    public PlanController(AccountService account, PayService pay, FitplanProperties props) {
        this.account = account;
        this.pay = pay;
        this.props = props;
    }

    @GetMapping("/api/plan")
    public Map<String, Object> plan(HttpServletRequest request) {
        Map<String, Object> user = account.requireUser(TokenSupport.bearer(request), "没有有效会话");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("plan", account.planState(user));
        out.put("expiresAt", JsonUtil.iso(user.get("plan_expires_at")));
        Map<String, Object> price = new LinkedHashMap<>();
        price.put("yuan", props.getPay().getPriceYuan());
        price.put("days", props.getPay().getDays());
        out.put("price", price);
        out.put("payReady", pay.payMissing().isEmpty());
        return out;
    }
}
