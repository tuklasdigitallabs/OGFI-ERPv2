# DEC-0217 — Sensitive Role Request permission-integrity guard

Date: 2026-07-25  
Status: Accepted  
Decision chair: Parent agent  
Deliberators: independent product and architecture reviews (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Sensitive Role Request creation and approval use a canonical tenant-local/global permission snapshot. Unsupported `RolePermission` links fail closed with `ROLE_PERMISSION_SCOPE_CORRUPTED` before request/assignment, audit, or notification effects. Creation and approval repeat the snapshot after locking the role inside the mutation transaction, so a concurrent permission-link change cannot grant a corrupted role or write misleading permission metadata.

Pending request previews expose only tenant-local/global permission labels and mark an integrity issue without disclosing foreign permission codes. Approval controls are hidden for that request until the role links are repaired through an approved data-correction path. Rejection remains available because it is non-granting cleanup. Rejection no longer hydrates role permissions.

## Required verification

Core Administration focused tests, web typecheck, lint, production build, and diff hygiene must pass. Disposable PostgreSQL foreign-permission/no-mutation and locked-race fixtures, query-plan evidence, responsive browser/mobile, hosted recovery, and UAT remain open gates. Permission Access global-role provenance parity is a separate follow-up slice.
