# DEC-0117 — Administration Approval Rules Registry Pagination

**Status:** ACCEPTED — July 24, 2026  
**Decision Chair:** Parent implementation agent  
**Fallback model note:** GPT-5.6 subagents were used because Code Spark and GPT-5.4 were unavailable in the active toolset.

## Decision

Replace the unbounded Approval Rules overview read with a server-owned paginated registry. The registry accepts bounded transaction-type search and an `ACTIVE`/`INACTIVE` filter, uses page 1–10,000 and page sizes 10–100 (default 25), and orders deterministically by `isActive DESC, priority ASC, id ASC`.

Visibility remains the existing selected-company contract: rules in the active tenant where `companyId` is the selected company or `NULL` (tenant-wide). The existing Core Admin, tenant-role administration, and selected-company `MANAGE` guards run before count or row queries. No company selector, all-company mode, mutation authority, or Approval Inbox behavior is added.

Rows expose only identity, transaction type, scope label, priority, active status, an exact step count, and a bounded ordered preview of at most the first three step order/approver-type labels. Full steps, thresholds, conditions, assignees, and audit data remain on the independently authorized detail route. If more than three steps exist, the UI discloses that the preview is partial.

## Alternatives and safeguards

- Keeping the eager list was rejected because visible operational lists must be bounded.
- Removing all step context was rejected because the current visible cards promise step count and summary; omission would silently regress the surface.
- Reusing the full `steps` relation was rejected because it creates page-size × step-count fan-out and risks routing-policy disclosure.

The allowlisted preview projection is tested for bounded relation loading, tenant/company-or-null isolation, count/page parity, deterministic ties, invalid inputs, no-query denial, and non-enumerating direct-detail denial.
