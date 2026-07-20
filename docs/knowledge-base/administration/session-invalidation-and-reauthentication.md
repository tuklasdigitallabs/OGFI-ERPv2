# Session Invalidation And Reauthentication

**Audience / required role:** ERP administrators and security owners  
**Applies to:** Role changes, scope changes, break-glass access, and other privileged access updates  
**Last verified against:** implemented demo-session privilege epoch checks and provider-neutral auth session invalidation register

## Purpose

When a user’s privileges change, stale sessions must not keep old access. The ERP handles this in two layers:

- Demo sessions are checked against the user privilege epoch and must sign in again after privilege changes.
- Production auth-provider invalidation is recorded in an ERP-side invalidation register until the external identity provider is integrated.

## What Creates An Invalidation Record

The ERP records an invalidation requirement when privileged access changes, including:

- role assignment or deactivation
- scope assignment or deactivation
- controlled high-risk scope approval
- break-glass activation, revocation, or expiry

## Where To Review It

Open **Admin > Session Invalidation**. The queue shows the affected user, why the invalidation was created, whether the demo-session privilege epoch is already enforced, and whether production provider follow-up is still pending.

Use **Mark Provider Complete** only after the identity-provider action has been performed outside the ERP and the provider ticket, audit entry, or session-revocation reference is available. The admin who triggered the invalidation cannot mark their own provider follow-up complete; a separate admin reviewer must confirm the external evidence.

## What This Does Not Do Yet

The register does not terminate sessions inside Microsoft Entra, Google Workspace, Okta, or another identity provider by itself. It records the required provider action and keeps audit evidence until the provider adapter is implemented.

## What To Check

- The target user is forced to reauthenticate in demo mode after privilege changes.
- The invalidation register has a pending provider record for production follow-up under **Admin > Session Invalidation**.
- The related role, scope, or break-glass audit event explains why the invalidation was required.
- The provider completion entry includes the provider name, external reference, reason, actor, and audit event.
- Provider completion is confirmed by a separate admin reviewer, not the same admin who triggered the invalidation.
- Release readiness should not mark production session invalidation complete until the external provider process is evidenced.
