# DEC-0098 — Immutable Recount Attempts and Count-Variance Recovery

## Metadata

- Decision ID: `DEC-0098`
- Title: Additive immutable stock-count attempts and linked variance recovery
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Stock Counts, Stock Adjustments, Inventory Ledger, and Overview
- Related decision brief: `DEC-0061-RECOUNT-ATTEMPT-DECISION-BRIEF.md`

## Decision

Implement recounts as an additive immutable child `StockCountAttempt`/version model with immutable attempt lines. Preserve the current `StockCountSession` as the stable count case and migrate its existing evidence to attempt 1; later recounts create new attempts rather than overwriting prior lines or review facts. A cutoff may be retained only while the movement freeze has remained continuously active and no movement has posted after the cutoff under the canonical inventory-location lock. Otherwise, close the affected attempt through a controlled terminal path and begin a new attempt with a new cutoff.

An approved-but-unposted linked count-variance adjustment may be voided for recount only through an explicitly authorized, MFA-protected action requiring reason and configured evidence. The action is idempotent, preserves the complete approval history, and terminates pending approval/posting steps so the adjustment cannot later post. A posted adjustment is never voided for recount; it requires the established full-document reversal path before a corrective attempt begins.

## Context

The current `RECOUNT_REQUESTED` flow reopens a session and mutates the same count lines, so original physical evidence, review context, and count-to-adjustment lineage cannot be reconstructed. `DEC-0060` therefore blocks Count Variance activation until recount history is immutable. Recovery also needs to address a linked Stock Adjustment that has been approved but not yet posted: silently replacing it could leave an approval step, notification, or retry capable of posting an obsolete variance. The solution must preserve blind-count redaction, location serialization, tenant/company scope, exact-once inventory effects, and auditable recovery.

## Options considered

### Option A — Additive child attempt/version model (selected)

- Summary: Keep one stable count case/session and append immutable attempts and attempt lines; retain the existing session as attempt 1 and link review, recount, and adjustment records to an attempt.
- Benefits: Preserves historical evidence and stable case identity, supports explicit current-attempt selection, allows safe migration, and keeps lineage without cloning an unbounded chain of top-level sessions.
- Failure modes: Requires new schema/relations, migration of existing session/line facts, current-attempt invariants, and careful authorization/read redaction across case and attempt levels.
- Why selected: It satisfies immutable evidence and operational continuity while minimizing disruption to existing session references and dashboards.

### Option B — Clone a new top-level session for each recount (rejected)

- Summary: Create a separate Stock Count Session for every recount and link sessions as a chain.
- Benefits: Strong physical immutability with simple per-session rows.
- Failure modes: Fragments the operational case, complicates task/dashboard references and reporting, risks duplicate assignments, and makes scope/freeze lineage harder to enforce.
- Why rejected: It creates avoidable identity and reconciliation ambiguity for one count case.

### Option C — Keep mutable lines and add richer audit events (rejected)

- Summary: Continue overwriting the session/lines while storing snapshots in audit events.
- Benefits: Smallest schema change.
- Failure modes: Audit snapshots are not the authoritative count-line source, current relations remain mutable, redaction/reconstruction is fragile, and linked adjustment lineage can still drift.
- Why rejected: It fails the immutable evidence hard gate.

### Option D — Defer Count Variance activation (fallback gate)

- Summary: Keep Count Variance disabled until the selected model and recovery controls are implemented and verified.
- Benefits: Prevents unsafe inventory posting.
- Failure modes: Delays operational variance correction and does not solve the underlying recount evidence gap.
- Why retained as a gate: It is the mandatory fallback whenever any implementation or evidence requirement remains incomplete.

## Hard-gate assessment

- **Scope and authorization:** Case, attempt, lines, adjustment, and reversal actions retain tenant/company/inventory-location scope and server-enforced role/scope checks. Blind-count and reviewer-only facts remain redacted according to `DEC-0060`; recount authority must not be inferred from UI visibility.
- **Immutable evidence:** Attempt and attempt-line facts, review decisions, reviewer identity, cutoff, and adjustment lineage are append-only after submission/review. A new attempt never edits prior evidence.
- **Movement and cutoff integrity:** Count start, movement posting, freeze transition, attempt creation, cutoff retention, and variance generation serialize on the complete canonically ordered inventory-location lock set. Retaining a cutoff is valid only when the freeze stayed continuously active and no post-cutoff movement committed; otherwise a new cutoff is mandatory.
- **Inventory and adjustment integrity:** Approved-but-unposted void-for-recount creates no inventory movement, is idempotent, terminates pending steps, and preserves approval history. A posted adjustment can only be corrected through full-document reversal with source movement lineage; no partial or silent replacement is permitted.
- **Audit and notification:** Every attempt, recovery, void, termination, reversal, and new cutoff is append-only auditable. Notification recipient, retry, deduplication, and cancellation behavior must be specified and tested before activation.
- **Recovery and migration:** Existing sessions and lines migrate losslessly to attempt 1 with stable identifiers or explicit mapping. Migration must be transactional/restart-safe, preserve links and audit, and include rollback/verification evidence.
- **Phase scope:** This decision authorizes the data/workflow direction only. Count Variance remains disabled until implementation, authorization, notification, migration, browser, disposable PostgreSQL, and production gates pass.

## Required safeguards and open implementation gates

- Define the exact attempt/session state machine, current-attempt invariant, allowed close/recount transitions, and how submitted/reviewed/cancelled attempts are selected for read and task surfaces.
- Define the authority matrix for requesting recount, retaining a cutoff, closing an attempt, voiding an approved-but-unposted adjustment, reversing a posted adjustment, and starting a corrective attempt. Enforce no self-approval and any required segregation of duties.
- Specify MFA step-up behavior, expiry/replay protection, stable user-safe error codes, reason/evidence requirements, and idempotency key scope for void-for-recount. Do not log secrets or raw MFA material.
- Implement approval-instance termination so every pending step, notification, retry, and inbox obligation for a voided adjustment becomes terminal and cannot post; preserve prior approval decisions and audit history.
- Define notification fan-out, deduplication, cancellation, escalation, and recipient scope for new attempts, retained/invalidated cutoffs, voided adjustments, and reversals. This remains open until confirmed by product/operations and verified end to end.
- Produce a migration plan for existing `StockCountSession`/`StockCountLine` records, including mapping to attempt 1, generated-adjustment links, audit preservation, duplicate/retry behavior, rollback, and post-migration counts/checksums.
- Use one transaction and canonical location-lock order for attempt creation, cutoff retention/renewal, adjustment generation, void-for-recount, and reversal. Add concurrency tests proving no movement slips across a retained cutoff and no adjustment posts after void.
- Preserve blind-count redaction in case, attempt, detail, export, audit, dashboard, and My Tasks projections. Never expose system quantity, variance, reviewer facts, or adjustment linkage to an unauthorized counter.
- Keep Count Variance dashboard/task activation blocked until all gates and UAT scenarios pass, including mobile recount, MFA recovery, denied authority, stale retry, notification cancellation, and posted-reversal flows.

## Implementation and documentation impact

- **Code / architecture:** Additive attempt/version entities and transaction boundaries; existing session remains the stable case identity. The migration and reversible first-pass dual-write mirror (start, entry-save, submit, review) are implemented; recovery actions and Count Variance activation remain gated.
- **Data / schema:** New child tables/relations and migration to attempt 1 require reviewed Prisma migration, data dictionary/schema updates, rollback, and verification evidence.
- **Workflow / permissions:** Add explicit attempt/recovery permissions and segregation controls; preserve existing stock-count and adjustment permissions until the authority matrix is confirmed.
- **UI / mobile:** Show case and current attempt clearly, preserve blind-count behavior, explain cutoff retention versus new cutoff, and provide focused MFA/reason/evidence recovery actions only to authorized roles.
- **Reporting:** Reports and dashboards must distinguish count case, attempt, current attempt, voided adjustment, and posted reversal without double-counting variance.
- **Knowledge base / training:** Document immutable recount history, cutoff conditions, void-for-recount versus posted reversal, MFA/evidence expectations, and recovery messaging after implementation is verified.
- **Tests / UAT:** Require unit/service, authorization, concurrency, idempotency, migration, disposable PostgreSQL, responsive-browser, notification, and production-build evidence before Count Variance activation.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Define attempt/session state machine and current-attempt invariant | Inventory product + engineering | Before schema implementation | Open gate |
| Confirm authority matrix, MFA, reason/evidence, and segregation | Security + Operations + Finance | Before void/reversal implementation | Open gate |
| Specify approval-step termination and notification behavior | Approval/Notifications owners | Before activation | Open gate |
| Produce migration, rollback, and verification plan for attempt 1 | Data engineering | Before migration | Open gate |
| Implement additive attempt model and immutable line lineage | Inventory engineering | After gates close | Foundation implemented; recovery/cutover remains open |
| Validate concurrency, idempotent void, reversal, redaction, and UAT | QA + Security + Release | Before Count Variance activation | Required |
| Update stock-count/adjustment specifications, glossary, KB, and plan | Mithi + Dunong | With implementation checkpoint | Required |

## Evidence

- `docs/core/00-governance/DEC-0061-RECOUNT-ATTEMPT-DECISION-BRIEF.md`: original open decision and hard gates.
- `DEC-0060-BLIND-COUNT-REDACTION-AND-COUNT-VARIANCE-DASHBOARD-ACCESS.md`: blind-count and Count Variance activation prerequisites.
- `DEC-0026-STOCK-COUNT-VARIANCE-ADJUSTMENT-BRIDGE.md`: linked adjustment lineage and non-posting bridge.
- `DEC-0068-STOCK-COUNT-MY-TASKS-AND-INVENTORY-LOCATION-SERIALIZATION.md`: canonical inventory-location serialization and first-pass task boundaries.
- Parent-agent independent database, workflow, security, and release reviews and challenge round on 2026-07-24. Requested Code Spark/GPT-5.4 reviewer identifiers were unavailable; the closest permitted GPT-5.6 fallback was used without relaxing hard gates.

## Supersession

This record confirms and supersedes the open policy question in `DEC-0061-RECOUNT-ATTEMPT-DECISION-BRIEF.md`; implementation gates above remain open. It does not supersede `DEC-0060`, `DEC-0026`, or `DEC-0068` and must be read with those controls.
