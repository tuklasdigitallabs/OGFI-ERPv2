# Managing Break-Glass Access

**Audience / required role:** ERP administrators, security owners, and release managers with Core Administration access  
**Applies to:** Emergency, time-boxed ERP location-scope access  
**Last verified against:** implemented Break-Glass Access register, request, approval, activation, revocation, expiry, post-review, audit, and session revalidation controls

## Purpose

Use Break-Glass Access only when emergency ERP access is needed and normal role/scope administration is too slow for the incident. It is not routine onboarding, permanent access, or a replacement for role configuration.

Break-glass access grants a temporary location scope after a separate admin approval. It requires expiry, reason, evidence, audit, revocation or expiry, and post-use review.

## Navigation Path

`Admin` → `Break-Glass Access`

## Request Access

1. Open `Break-Glass Access`.
2. Select `Request Access`.
3. Choose the target user.
4. Choose the location.
5. Choose the access level.
6. Enter an expiry date and time. The configured pilot maximum is 24 hours.
7. Enter the emergency reason.
8. Enter the evidence reference.
9. Submit the request.

## Approve Or Reject

1. Review the target user, location, access level, reason, evidence, requester, and expiry.
2. If valid, select `Approve` and enter the approval reason.
3. If invalid, select `Reject` and enter the rejection reason.

Approval activates the temporary location scope and refreshes the target user's privilege epoch so stale sessions must revalidate.

## Revoke Or Let Expire

- Select `Revoke` when access is no longer needed before the expiry time.
- Expired active grants are closed automatically when the register is opened.
- Revocation and expiry deactivate the temporary scope assignment and refresh the target user's privilege epoch.

## Complete Post-Review

After access is rejected, revoked, or expired:

1. Select `Post-Review`.
2. Choose the outcome.
3. Enter the review reason.
4. Enter the review evidence reference.
5. Save the post-review.

## Controls And Warnings

- You cannot request break-glass access for yourself.
- You cannot approve, reject, or post-review break-glass access that you requested or that grants access to yourself.
- Break-glass requests are company-scoped and location-scoped.
- Active or pending duplicate break-glass access for the same target user is blocked.
- Every request, activation, rejection, revocation, expiry, and post-review writes audit history with the DEC-0036 reference.
- External MFA, identity-provider elevation, infrastructure access, and vault activity must still be evidenced in their approved systems.

## What To Check

- The emergency reason is specific and time-sensitive.
- The evidence reference can be traced.
- The expiry is as short as possible and never beyond the pilot maximum.
- Active access is revoked when the emergency ends.
- Post-review is completed with the outcome and evidence.
