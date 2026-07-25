# DEC-0210 — Core Administration Role Library tenant-safe preview

Date: 2026-07-25  
Status: Accepted  
Decision chair: Parent agent  
Deliberators: independent product and architecture reviews (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 models were unavailable)

## Decision

The Role Library remains a tenant-role catalog with a bounded three-permission informational preview. The preview and permission count use explicit permission projections and include only tenant-local or global permissions. High-access counts use the same predicate. A filtered stale page is clamped to the current last page, while deterministic name/ID ordering, search/status filters, tenant-role authority, and selected-company Manage guards remain unchanged.

The preview does not replace Role Detail, does not grant or mutate access, and does not expose the full permission catalog. Role Detail remains the authoritative complete permission and mutation surface.

## Rationale and safeguards

- Explicit selects prevent unrelated permission fields from being hydrated.
- A page-local three-row preview remains bounded; grouped counts preserve an exact eligible permission count for each visible role.
- Tenant-local/global predicates prevent malformed role-permission links from crossing tenant boundaries or distorting high-access indicators.
- Stale-page clamping prevents a filtered URL from showing a false empty state while totals indicate records.

## Required verification

Core Administration contract tests and web typecheck must pass. Disposable PostgreSQL permission isolation/query-plan, responsive browser/mobile, hosted recovery/deployment, and UAT evidence remain open gates.
