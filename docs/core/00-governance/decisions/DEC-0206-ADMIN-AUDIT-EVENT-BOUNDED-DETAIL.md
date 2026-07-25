# DEC-0206 — Administration Audit Event bounded detail projection

Date: 2026-07-25  
Status: Accepted conditionally for implementation  
Decision chair: Parent agent  
Deliberators: Product analysis and architecture review (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 unavailable)

## Decision

Audit Event detail remains read-only and uses an explicit tenant-safe relation projection. The route rejects malformed UUIDs before Prisma lookup. Before/after/metadata values are recursively redacted and bounded by maximum depth, node count, and serialized bytes; when a budget is reached the response includes an explicit truncation marker and the UI explains that the immutable event was not changed.

## Controls and open gates

The existing audit resolver remains the authority for Core Administration, tenant-role authority, selected-company Manage, and tenant/company or tenant-wide visibility. Actor email, IP, credential, token, storage, and signed-URL fields remain redacted or omitted. PostgreSQL isolation/query-plan, responsive browser/mobile, hosted recovery/deployment, and UAT evidence remain open.
