# Activating And Recovering Local Accounts

**Who can do this:** ERP administrators and security owners with Core Administration access; recovery approval or rejection requires a different MFA-assured administrator

**Applies to:** New local identities and recovery of existing local accounts

**Last verified against:** implemented Authentication workspace, 30-minute single-use activation, controlled recovery, session revocation, optional MFA reset, and audit events

## Purpose

Use the Authentication workspace to issue first-time activation for a new identity or run controlled recovery for an existing account. Existing accounts cannot receive a direct replacement link without independent review.

The deployment-only first-administrator bootstrap is not an account-recovery tool. It succeeds only once per tenant for a pre-authorized administrator with active company scope, writes its link to a restricted file instead of logs, and permanently refuses later use. All routine work uses this Authentication workspace.

## Prerequisites

- Core Administration permission in the current company scope.
- Fresh runtime MFA assurance within the current 15-minute step-up window when the application requests it.
- For recovery, a verified identity-recovery reason, an evidence reference, and a different eligible administrator to review the request.
- The user's current account email address must be an approved, verified delivery address. Production email delivery must be configured and healthy.

## Navigation Path

`Admin` → `Authentication`

## Activate A New Identity

1. Under `Send activation link`, select an account whose credentials are `Not activated`.
2. Select `Send link`.
3. If prompted, open `Security` → `Account security`, select `Refresh MFA assurance`, complete the challenge, and repeat the issue action.
4. Confirm that the workspace reports delivery to the account email address. The raw link is not displayed to administrators.
5. If delivery fails, use `Activation delivery attention` to retry before expiry after the email transport issue is corrected.

The user opens the link, creates and confirms a password that meets the displayed policy, and selects `Activate account`. A privileged user then enrolls or verifies runtime MFA as directed.

## Recover An Existing Account

1. Under `Controlled recovery`, select the existing account.
2. Choose `Password / credentials only` or `Password and lost MFA device`.
3. Enter the identity-verification reason and evidence reference.
4. Select `Request recovery review`.
5. Have a different eligible administrator review the target, requester, recovery scope, reason, and evidence.
6. The reviewer enters an independent review reason and selects `Approve and send link` or `Reject`.
7. If approved, the system sends the link directly to the target user's account email. If delivery fails, an MFA-assured administrator can retry it from `Activation delivery attention` before expiry.

## Expected Result

- A new identity receives a single-use activation link by account email that expires after 30 minutes.
- An approved recovery revokes the user’s prior application sessions and issues a new single-use activation link.
- If `Password and lost MFA device` was selected, the old local MFA authenticator is also revoked and the privileged user must enroll again.
- A rejected request does not issue a link.

## Controls And Warnings

- Direct activation is only for users without an active local identity. Existing accounts must use controlled recovery.
- The requesting administrator cannot review the same recovery request, and the target user cannot request or review their own recovery.
- Activation links are secrets. They are not shown to administrators and must not be copied into tickets, public chat, screenshots, or the MFA evidence register.
- A failed delivery does not expose the link. Correct the approved SMTP transport or account email and use the controlled retry action before expiry.
- Issuing a new link replaces prior active activation links. Each link is single-use and expires after 30 minutes.
- Recovery records the requester, reviewer, reasons, evidence reference, decision, timestamps, session invalidation, and related audit events.
- Account recovery changes authentication only. It does not grant a role, scope, approval authority, inventory access, or financial authority.

## What Happens Next

After activation, the user signs in with organization code, email, and the new password. Privileged users must complete runtime MFA enrollment or challenge. Current role and scope assignments continue to control which companies, brands, locations, and modules the user can access.

## Related Articles

- Signing In And Selecting Your Location
- Session Invalidation And Reauthentication
- Managing Privileged MFA Evidence
- Managing User Access And Controlled Scopes
