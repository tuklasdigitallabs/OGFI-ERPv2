# Inventory Control Pilot — Recount Recovery Foundation (Local, Default-Off)

The local candidate now preserves immutable stock-count attempt lineage for future recount recovery. A successor attempt starts from a new cutoff, linked adjustment dispositions are checked under the canonical inventory locks, reviewer-only history shows prior adjustment references, and assigned counters receive a state-aware `Start Recount` surface when the feature is enabled.

Recovery admission is not enabled. It requires live permission/scope, MFA, actor segregation, exact active review-cohort pins, and an immutable controlled-evidence qualification. The controlled-evidence action adapter and policy remain dormant under DEC-0077; free-text evidence references cannot authorize recovery. The database rejects transitions without an exact-scope qualification, and the service fails closed before mutation.

This is a local implementation foundation only. Count Variance, recount My Tasks, hosted deployment, production authentication, browser UAT, recovery rehearsal, and release approval remain pending. No VPS deployment or origin push is included.

The follow-up migration `20260731150000_stock_count_recount_transition_truncate_guard` also closes the database role-contract gap by applying the append-only guard to `UPDATE`, `DELETE`, and `TRUNCATE`; the fresh 148-migration disposable role-contract verification passes.
