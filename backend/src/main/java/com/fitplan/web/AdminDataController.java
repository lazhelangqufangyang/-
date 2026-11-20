package com.fitplan.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitplan.config.ApiException;
import com.fitplan.service.AccountService;
import com.fitplan.service.AdminAuditService;
import com.fitplan.service.AdminDataService;
import com.fitplan.service.JsonUtil;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 管理端查询：订单列表/详情、用户元数据、审计；以及手工补发/撤销。 */
@RestController
public class AdminDataController {

    private final AccountService account;
    private final AdminDataService data;
    private final AdminAuditService audit;

    public AdminDataController(AccountService account, AdminDataService data, AdminAuditService audit) {
        this.account = account;
        this.data = data;
        this.audit = audit;
    }

    @GetMapping("/api/admin/orders")
    public Map<String, Object> orders(@RequestParam(value = "status", required = false) String status,
                                      @RequestParam(value = "q", required = false) String q,
                                      @RequestParam(value = "limit", defaultValue = "50") int limit,
                                      @RequestParam(value = "offset", defaultValue = "0") int offset) {
        return result(data.orders(status, q, limit, offset));
    }

    @GetMapping("/api/admin/orders/{outTradeNo}")
    public Map<String, Object> order(@PathVariable String outTradeNo) {
        Map<String, Object> order = data.order(outTradeNo);
        if (order == null) {
            throw new ApiException(404, "没有这个订单");
        }
        return order;
    }

    @GetMapping("/api/admin/users")
    public Map<String, Object> users(@RequestParam(value = "q", required = false) String q,
                                     @RequestParam(value = "limit", defaultValue = "50") int limit,
                                     @RequestParam(value = "offset", defaultValue = "0") int offset) {
        return result(data.users(q, limit, offset));
    }

    @GetMapping("/api/admin/audit")
    public Map<String, Object> audit(@RequestParam(value = "limit", defaultValue = "50") int limit,
                                     @RequestParam(value = "offset", defaultValue = "0") int offset) {
        return result(data.audits(limit, offset));
    }

    /**
     * 手工补发/撤销：补发优先用订单查单，这条只用于订单缺失的线下补偿。
     * 天数 1–365，原因 2–200 字，全部写审计。
     */
    @PostMapping("/api/admin/users/{id}/plan")
    @SuppressWarnings("unchecked")
    public Map<String, Object> changePlan(@PathVariable long id,
                                          @RequestBody(required = false) JsonNode body,
                                          HttpServletRequest request) {
        String action = JsonUtil.text(body, "action");
        if (!"grant".equals(action) && !"revoke".equals(action)) {
            throw new ApiException(400, "action 只能是 grant 或 revoke。");
        }
        int days = body == null ? 0 : body.path("days").asInt(0);
        if (days < 1 || days > 365) {
            throw new ApiException(400, "天数要在 1–365 之间。");
        }
        String reason = reasonOf(body);
        Map<String, Object> user = account.userPlanRow(id);
        if (user == null) {
            throw new ApiException(404, "没有这个用户");
        }
        Map<String, Object> before = planSnapshot(user);
        boolean changed = "grant".equals(action)
            ? account.grantPlan(id, days)
            : account.revokePlan(id, days);
        Map<String, Object> afterUser = account.userPlanRow(id);
        Map<String, Object> after = planSnapshot(afterUser);
        Map<String, Object> session = (Map<String, Object>) request.getAttribute("fitplan.admin");
        audit.record(
            ((Number) session.get("id")).longValue(),
            String.valueOf(session.get("login_name")),
            action, null, id, before, after, reason);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("changed", changed);
        out.put("plan", account.planState(afterUser));
        out.put("expiresAt", JsonUtil.iso(afterUser == null ? null : afterUser.get("plan_expires_at")));
        return out;
    }

    private static Map<String, Object> result(AdminDataService.QueryResult result) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", result.items());
        out.put("total", result.total());
        return out;
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

    private static String reasonOf(JsonNode body) {
        String reason = JsonUtil.text(body, "reason");
        String trimmed = reason == null ? "" : reason.trim();
        if (trimmed.length() < 2 || trimmed.length() > 200) {
            throw new ApiException(400, "原因必须填，2–200 字。");
        }
        return trimmed;
    }
}