# DEC-0158 — Recent slice boundary typing repair

Date: 2026-07-25  Status: Confirmed implementation decision

Repair the exact-optional and generated-client boundary types exposed by the recent conversion option catalog, Purchase Order recommendation lookup, quote queue filters, role-permission projection, and Admin scope work. Use conditional spreads for optional values, explicit allowlist narrowing for lookup kinds, widened quote page input, and the composite RolePermission identity. No business or authorization behavior changes.

Evidence: web TypeScript check, Core Admin tests 32/32, and `git diff --check` pass.
