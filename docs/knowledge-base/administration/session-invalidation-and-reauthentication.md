# Session Invalidation And Reauthentication

**Who can do this:** Any signed-in user can review and revoke their own application sessions; ERP administrators and security owners with Core Administration access can revoke another user’s sessions

**Applies to:** Local application sessions, role and scope changes, break-glass access, and optional external-provider follow-up

**Last verified against:** implemented PostgreSQL-backed sessions, user/admin revocation, privilege-version checks, and authorization-time break-glass expiry

## Purpose

Use this article to review or revoke application sessions and understand when reauthentication is required.

Local application sessions are server-controlled. Privilege changes revoke affected sessions transactionally so an old browser cookie cannot keep prior authority.

## Prerequisites

- To manage your own sessions: an active local sign-in.
- To revoke another user’s sessions: Core Administration permission in the current company scope and fresh runtime MFA when prompted.

## Navigation Paths

- Your sessions: page header `Security` → `Account security` → `Active sessions`
- Another user’s sessions: `Admin` → `Authentication` → `Account readiness`
- External-provider follow-up, when used: `Admin` → `Session Invalidation`

## Revoke Your Own Session

1. Open `Security` → `Account security`.
2. Review the `Active sessions` list and each session’s assurance level and last-used time.
3. Select `Revoke` beside the session you no longer trust or use.
4. If you revoke the current session, sign in again to continue.

## Revoke Another User’s Sessions

1. Open `Admin` → `Authentication`.
2. Find the user under `Account readiness`.
3. Review the displayed number of active sessions.
4. Select `Revoke all`.
5. Complete runtime MFA step-up if the application requests it, then repeat the action.

## Expected Result

- A revoked local application session can no longer authorize requests.
- `Revoke all` invalidates all application sessions for the selected user.
- The revocation is recorded in the audit trail.

## Controls And Warnings

- You cannot use the admin action to revoke your own sessions; use `Account security` instead.
- Role, scope, controlled-access, credential-recovery, and other privilege changes can revoke sessions and require a new sign-in.
- Break-glass scope is checked against its expiry during authorization. Expired access cannot continue merely because a session is still open.
- Session revocation does not delete the user, assignments, or audit history.
- Local application-session revocation is authoritative. External identity-provider session termination is a separate, conditional follow-up only when an external provider is configured.

## What Happens Next

The affected user signs in again with organization code, email, password, and runtime MFA when required. Their current role, scope, and unexpired break-glass access are resolved again by the server.

If an external provider is configured and a follow-up record exists, use `Admin` → `Session Invalidation`. Select `Mark Provider Complete` only after the external action is finished and its provider name and reference are available. A separate administrator must confirm it.

## Related Articles

- Signing In And Selecting Your Location
- Activating And Recovering Local Accounts
- Managing Break-Glass Access
- Managing Privileged MFA Evidence
