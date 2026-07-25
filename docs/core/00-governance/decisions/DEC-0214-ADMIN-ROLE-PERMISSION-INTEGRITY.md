# DEC-0214 — Role Detail permission-link integrity fail-closed behavior

Date: 2026-07-25  
Status: Accepted  
Decision chair: Parent agent  
Deliberators: independent product and architecture reviews (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Role Detail derives its enabled permissions, matrix, counts, drift indicators, and hidden preservation codes from the same tenant-local/global permission predicate. It checks for unsupported RolePermission links. If any exist, the detail remains readable with a truthful `permissionIntegrityIssue` state, but all permission mutation composers are hidden and direct mutation attempts fail with `ROLE_PERMISSION_SCOPE_CORRUPTED` before audit or writes. The transaction rechecks the condition after locking the role.

Unsupported links are not silently deleted or repaired. Role Detail tells the administrator that permission data needs reconciliation; complete permission editing resumes only after the integrity issue is resolved through an approved data correction path.

## Required verification

Core Administration tests, web typecheck, lint, production build, and diff hygiene must pass. Disposable PostgreSQL foreign-permission fixture/no-mutation and query-plan evidence, responsive browser/mobile, hosted recovery, and UAT remain open gates.
