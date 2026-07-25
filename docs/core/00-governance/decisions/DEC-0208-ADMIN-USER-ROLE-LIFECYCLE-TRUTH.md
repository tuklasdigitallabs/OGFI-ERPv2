# DEC-0208 — User Access Assigned Role Lifecycle truth

Date: 2026-07-25  
Status: Accepted conditionally for implementation  
Decision chair: Parent agent  
Deliberators: Product analysis and architecture review (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 unavailable)

## Decision

Keep User Access Assigned Role Lifecycle as a status-active, assignment-grain register. Do not date-filter it: scheduled and ended assignments are needed for lifecycle, revocation, and audit context. Expose a computed assignment state (`CURRENT`, `FUTURE`, or `EXPIRED`) and endsAt, and distinguish that state from the role definition status. The effective-permission register remains the authority for current access.

## Controls and open gates

Existing tenant/global role predicates, server authorization, deactivation CAS, self-protection, and audit behavior remain unchanged. The lifecycle register grants no authority. PostgreSQL lifecycle/effective-permission isolation, responsive browser/mobile, hosted recovery/deployment, and UAT evidence remain open.
