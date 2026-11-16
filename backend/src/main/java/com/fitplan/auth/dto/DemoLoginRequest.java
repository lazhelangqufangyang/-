package com.fitplan.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record DemoLoginRequest(@NotBlank(message = "请选择体验账号") String account) {
}
