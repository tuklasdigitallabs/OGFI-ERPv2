# DEC-0204 — Administration Company Context bounded access

Date: 2026-07-25  
Status: Accepted conditionally for implementation  
Decision chair: Parent agent  
Deliberators: Product analysis and architecture review (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 unavailable)

## Decision

Company Context remains a read-only selected-company drilldown. Derive explicit relation counts for Brands and Locations, remove hidden approval-rule and child-list hydration, and provide an assignment-grain Company Access register with exact count, bounded 10–100 pages, optional bounded name/email search, finite inputs, stale-page clamping, deterministic `userId ASC, assignmentId ASC` ordering, and safe projections. Access rows require active/effective company assignments, active users in the current tenant, and active/effective tenant-local or global role previews.

Brands and Locations hand off to Organization Scope, while Approval Rules remain in their authoritative registry. User Access remains authoritative for access changes.

## Controls and open gates

Existing Core Administration, tenant-role administration, selected-company Manage, and tenant/company guards remain server-enforced. Malformed company IDs return not-found. The shared count/page predicate is intentionally Prisma-based and can drift under concurrent assignment changes; query-plan evidence may justify a later index or snapshot contract. PostgreSQL isolation/query-plan, responsive browser/mobile, hosted recovery/deployment, and UAT evidence remain open.
