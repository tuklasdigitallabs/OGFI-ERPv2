# DEC-0207 — Administration Role Detail effective assignment previews

Date: 2026-07-25  
Status: Accepted conditionally for implementation  
Decision chair: Parent agent  
Deliberators: Product analysis and architecture review (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 unavailable)

## Decision

Role Detail Assigned Users is an effective assignment-grain register: active assignments must be within their start/end window, the user must be active in the current tenant, and the role must be active and tenant-local or global. The register remains bounded, searchable, and URL-paginated. Each row carries only a selected-company scope preview, capped at eight rows with an explicit cap indicator; company scope ID catalogs are bounded to 1,001 IDs per type.

## Controls and open gates

Tenant-role administration and selected-company Manage authorization remain server-enforced. Malformed role IDs return not-found. Scope previews never grant authority and may be incomplete; source workspaces and User Access remain authoritative. PostgreSQL effective-date/isolation/query-plan, responsive browser/mobile, hosted recovery/deployment, and UAT evidence remain open.
