# Managing Privileged MFA Evidence

**Audience / required role:** ERP administrators, security owners, and release managers with Core Administration access  
**Applies to:** Users with sensitive ERP permissions  
**Last verified against:** implemented privileged MFA enrollment evidence register, attestation, verification, revocation, sensitive-action evidence guard, audit, and DEC-0036 readiness controls

## Purpose

Use MFA Enrollment to track evidence that privileged users are enrolled in the selected external MFA or identity provider.

This is ERP-side enrollment evidence tracking. It does not replace runtime MFA authentication at sign-in. External IdP/provider or vault proof is required for production runtime enforcement.

## Navigation Path

`Admin` → `MFA Enrollment`

## Record Evidence

1. Open `MFA Enrollment`.
2. Select `Record Evidence`.
3. Choose the target privileged user.
4. Enter the provider name.
5. Enter an optional provider subject or opaque reference.
6. Enter the evidence reference.
7. Enter the attestation note.
8. Save the evidence.

## Verify Evidence

1. Review the target user, provider, evidence, and attestation.
2. Select `Verify`.
3. Enter the verification note.
4. Save the verification.

Attestation and verification must be performed by different admins. Self-attestation and self-verification are blocked.

## Revoke Evidence

Use `Revoke` when MFA enrollment is removed, stale, replaced, or no longer trusted. Revocation records the reason and keeps the history.

## Sensitive Action Guard

Open **Admin > Admin Settings > Security and continuity** to review the privileged MFA enforcement mode.

- **Warn and audit missing evidence** records an audit warning when a selected sensitive administrative/security action is attempted without verified MFA evidence.
- **Block high-risk admin and security actions** prevents selected sensitive administrative/security actions until the acting admin has verified MFA evidence.
- **Block all guarded sensitive actions** also blocks guarded operational posting/reversal actions until the acting user has verified MFA evidence.

The first guarded actions are high-risk role-permission changes, controlled high-risk scope requests/reviews, break-glass request/approval/revocation/post-review actions, receiving post/reversal, stock adjustment post/reversal, wastage post/reversal, and transfer receipt reversal.

## Controls And Warnings

- The register includes users with sensitive permissions in the current company scope.
- Evidence references must be plain text references, not uploaded files or runtime tokens.
- The ERP does not store MFA secrets, recovery codes, passwords, device keys, or identity-provider tokens.
- Every record, verification, and revocation writes audit history with `DEC-0036` metadata.
- Missing evidence on guarded actions writes `privileged_mfa.required_warning` or `privileged_mfa.required_denied` audit history depending on the configured mode.
- Production runtime MFA enforcement still depends on the selected external identity provider.

## What To Check

- The user really has privileged ERP access.
- The provider and evidence reference match the approved external MFA/IdP system.
- The verifier is not the target user and not the attesting admin.
- The release readiness MFA gate points to the evidence pack or this register.
