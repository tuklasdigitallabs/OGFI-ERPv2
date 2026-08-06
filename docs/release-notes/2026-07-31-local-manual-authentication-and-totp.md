# Local manual account activation and TOTP MFA

The local candidate now supports an SMTP-free, administrator-issued temporary password for active non-privileged test users. The credential expires after 30 minutes, is consumed once, forces a server-enforced password change, invalidates prior sessions, and is never recorded in audit data.

Privileged, approver, sensitive-role, and high-risk-scope accounts remain excluded from this fallback. Those accounts require the existing local TOTP enrollment and MFA-assured recovery controls. Google Authenticator-compatible TOTP is local application behavior and does not require an external MFA provider.

This is local/test-data UAT behavior only. SMTP activation/recovery remains fail-closed when no mail transport is configured, and no VPS deployment or production authorization is implied.

Local sign-out now returns to the canonical configured application URL with a `303` redirect, preventing the browser from replaying the sign-out request against the container's internal port.
