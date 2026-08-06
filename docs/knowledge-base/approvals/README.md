# Approvals

How authorized approvers review, approve, reject, or return records for revision.

Use the knowledge-base article template and follow the knowledge-base standard.

## Inventory Control UAT approvals

- [Reviewing Bounded Inventory Control UAT Approvals](./reviewing-bounded-inventory-control-uat-approvals.md) — pre-release guidance for the partial seven-family worklist. The locally implemented surface remains NO-GO for UAT until its remaining PostgreSQL and trusted-TLS responsive-browser evidence passes.

This bounded worklist does not activate or replace the global Approval Inbox. It
does not show finance, workforce, projects, or any other approval family.

## Workforce overtime records during controlled routing

When an overtime record is already linked to a governed approval graph, the
legacy Workforce approval action is intentionally unavailable while normalized
routing is disabled. Use the Approval Inbox when controlled routing is enabled;
the source record and approval graph must remain a single auditable workflow.
Rejection and cancellation actions still require their documented permissions,
scope, reason, and audit controls. Do not retry or bypass a disabled approval
action to force a status change.

## Workforce leave records during controlled routing

If a leave request is linked to a governed approval graph, legacy Workforce
approve, return, reject, and cancel actions are unavailable while normalized
routing is disabled. Open the Approval Inbox when controlled routing is
enabled; do not retry a legacy action or bypass the graph. Graph-free historical
records may retain their documented legacy action subject to permission, scope,
reason, and audit checks.
