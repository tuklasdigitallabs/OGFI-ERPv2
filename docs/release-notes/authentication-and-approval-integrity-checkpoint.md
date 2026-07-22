# OGFI ERP Release Notes — Authentication And Approval Integrity Checkpoint

**Release date:** Controlled implementation checkpoint; production activation pending
**Audience:** ERP users, approvers, administrators, support owners, and deployment operators
**Affected roles:** Users signing in with local credentials or runtime MFA; users who review controlled approvals

## What changed

- Sign-in and MFA processing now use bounded server controls that protect password-verification capacity and fail safely during excessive or inconsistent traffic.
- Authentication success re-checks the current account, credential, MFA authenticator or recovery code, and session authority together before creating an authenticated session.
- Repeated denied actions are summarized through bounded audit evidence instead of creating an unlimited permanent event stream. Actual approval, return, reject, lock, recovery, session, and other authoritative decisions remain individually auditable.
- The Approval Inbox implementation can resolve directly assigned and role-scoped work from current permission, assignment, scope, active-resource, and segregation rules with server pagination.
- Passive `Returned` and `Audit` inbox tabs were removed. Audit history remains available from the authoritative record where implemented.

## What you need to do

- If sign-in is temporarily rejected during heavy traffic, wait briefly and retry once. Continued safe rejection should be reported to support; it does not confirm whether an account exists.
- Refresh the Approval Inbox before retrying an approval that reports stale authority or a concurrent decision.
- Treat notifications as reminders only. They do not grant approval authority.

## Important limitations

- Normalized role-scoped approval routing remains disabled. It must not be enabled until the 18-document-type backfill, inbox/detail/action matrix, comparison smoke test, and rollback rehearsal pass.
- This checkpoint is not Hostinger production approval. Hosted Caddy image evidence, load and shared-NAT calibration, database migration/restore proof, external alert delivery and acknowledgement, and final release acceptance remain required.
- No AWS service, Redis limiter, queue, or external file-storage dependency was introduced.

## Learn more

- [Signing In And Selecting Your Location](../knowledge-base/getting-started/signing-in-and-selecting-your-location.md)
- [Why Can't I Approve This Request?](../knowledge-base/troubleshooting/why-cant-i-approve-this-request.md)
- [Glossary](../knowledge-base/GLOSSARY.md)
