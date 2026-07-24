# DEC-0118 — Administration User-Detail Option Catalogs

**Status:** ACCEPTED — July 24, 2026  
**Decision Chair:** Parent implementation agent  
**Fallback model note:** GPT-5.6 fallback specialists were used because Code Spark and GPT-5.4 were unavailable in the active toolset.

## Decision

Bound the user-detail assignment catalogs independently from the user’s scoped-record display. Active selected-company locations and active unassigned tenant roles are loaded as explicit option catalogs capped at 100, with deterministic name/ID ordering and `hasMore` indicators. Role permissions remain an allowlisted projection used only to classify direct versus controlled assignment; full role detail stays on the Role Library route.

Referenced locations from active scope assignments and controlled requests are loaded separately and remain available for display even when outside the first 100 option rows. The catalog predicates remain tenant/company scoped and the existing server-side mutation revalidation remains authoritative. No UI-supplied scope, role eligibility, or overflow flag grants authority.

The user-detail page discloses when more options exist and links administrators to the relevant paginated workspace. It never claims that a capped selector is the complete catalog. No schema migration or new mutation route is introduced.

## Safeguards and tests

- Core Admin, tenant-role administration, and selected-company `MANAGE` guards execute before catalog queries.
- Active-only, tenant/company-scoped location options; active, tenant-scoped role options excluding already assigned roles.
- Referenced request/location display is not replaced by the capped selector query.
- Tests cover cap/order/overflow, selected-company isolation, denied no-query behavior, and UI overflow disclosure. Existing create/assign services continue to revalidate IDs and scope at mutation time.
