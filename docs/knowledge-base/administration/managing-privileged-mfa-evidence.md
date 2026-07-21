# Managing Privileged MFA Evidence

**Who can do this:** ERP administrators and security owners with Core Administration access

**Applies to:** External or future identity-provider MFA evidence for users with sensitive ERP permissions

**Last verified against:** implemented external MFA evidence register and implemented local runtime TOTP under Account security

## Purpose

Use MFA Enrollment to track evidence from an external or future MFA or identity provider.

This legacy register does not enroll a user in local runtime MFA and does not satisfy a local sign-in or sensitive-action MFA challenge. Local runtime MFA is enrolled by the user under `Security` → `Account security`.

## Prerequisites

- Core Administration permission in the current company scope.
- An approved external provider and a traceable evidence reference.
- A second eligible administrator for independent verification.

## Navigation Path

`Admin` → `MFA Enrollment`

## Steps

1. Open `MFA Enrollment`.
2. Select `Record Evidence`.
3. Choose the target privileged user.
4. Enter the provider name.
5. Enter an optional provider subject or opaque reference.
6. Enter the evidence reference.
7. Enter the attestation note.
8. Save the evidence.
9. Have a different administrator review the target user, provider, evidence reference, and attestation.
10. The reviewer selects `Verify`, enters the verification note, and saves it.

## Expected Result

The external-evidence record is `Verified`, with separate attesting and verifying administrators and retained audit history.

## Controls And Warnings

- The register includes users with sensitive permissions in the current company scope.
- Evidence references must be plain text references, not uploaded files or runtime tokens.
- The ERP does not store MFA secrets, recovery codes, passwords, device keys, or identity-provider tokens.
- Every record, verification, and revocation writes audit history with `DEC-0036` metadata.
- Attestation and verification must be performed by different administrators. The target user cannot attest or verify their own record.
- Use `Revoke` with a reason when the external enrollment is removed, stale, replaced, or no longer trusted. Revocation keeps the history.
- In local authentication mode, privileged sign-in and sensitive actions use runtime MFA. A verified record on this page is evidence only and cannot replace that live check.

## What Happens Next

The record remains available for audit and future/external-provider readiness. The user must separately enroll local runtime MFA under `Security` → `Account security` when their permissions require it.

## Related Articles

- Signing In And Selecting Your Location
- Session Invalidation And Reauthentication
- Managing Release Readiness Gates
