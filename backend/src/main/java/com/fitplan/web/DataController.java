package com.fitplan.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitplan.config.ApiException;
import com.fitplan.service.AccountService;
import com.fitplan.service.JsonUtil;
import com.fitplan.service.RecordsService;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** 记录接口：这个账号名下的档案和手记。传是整份覆盖，读是整份拿回去。 */
@RestController
public class DataController {

    /** 一份记录的体积上限：整份传，几百张表也就一两 MB，留足余量又不至于让谁把服务压死 */
    private static final long BODY_LIMIT = 8L * 1024 * 1024;

    private final AccountService account;
    private final RecordsService records;

    public DataController(AccountService account, RecordsService records) {
        this.account = account;
        this.records = records;
    }

    @PostMapping("/api/data/sync")
    public Map<String, Object> sync(HttpServletRequest request, @RequestBody(required = false) String body) {
        Map<String, Object> user = account.requireUser(TokenSupport.bearer(request), "先登录再往云端传");
        if (body == null || body.trim().isEmpty()) {
            throw new ApiException(400, "请求体是空的，没有记录可存");
        }
        if (body.getBytes(StandardCharsets.UTF_8).length > BODY_LIMIT) {
            throw new ApiException(413, "这份记录太大（超过 8 MB），先分次导出 JSON");
        }
        JsonNode data;
        try {
            data = JsonUtil.MAPPER.readTree(body);
        } catch (Exception e) {
            throw new ApiException(400, "请求体不是合法 JSON");
        }
        long userId = AccountService.userIdOf(user);
        Map<String, Object> saved = records.replaceRecords(userId, data);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("saved", saved);
        out.put("syncedAt", JsonUtil.isoNow());
        return out;
    }

    @GetMapping("/api/data")
    public Map<String, Object> read(HttpServletRequest request) {
        Map<String, Object> user = account.requireUser(TokenSupport.bearer(request), "没有有效会话");
        Map<String, Object> data = records.readRecords(AccountService.userIdOf(user));
        if (data == null) {
            throw new ApiException(404, "云端还没有这个账号的记录。在另一台设备上点过一次「传到云端」才会有。");
        }
        return data;
    }

    @DeleteMapping("/api/data")
    public Map<String, Object> clear(HttpServletRequest request) {
        Map<String, Object> user = account.requireUser(TokenSupport.bearer(request), "没有有效会话");
        records.clearRecords(AccountService.userIdOf(user));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("dropped", "records");
        return out;
    }
}
