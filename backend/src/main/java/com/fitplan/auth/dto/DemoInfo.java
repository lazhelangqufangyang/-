package com.fitplan.auth.dto;

import java.util.List;

public record DemoInfo(boolean enabled, List<DemoAccountView> accounts) {

    public record DemoAccountView(String account, String label, String role) {
    }
}
