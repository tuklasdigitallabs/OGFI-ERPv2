# DEC-0099 — Stock Count Dashboard Attempt-Line Parity Gate

## Metadata

- Decision ID: `DEC-0099`
- Title: Defer dashboard Stock Count attempt-line parity cutover pending bounded query evidence
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Inventory / Reporting workstreams
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Stock Counts and Overview dashboard
- Related decision brief: Parent-agent Stock Count dashboard attempt-parity review (confirmed 2026-07-24)

## Decision

Defer switching the Stock Count dashboard's aggregate and status predicates to attempt-line authority until one bounded attempt-only aggregate/predicate query and reviewed PostgreSQL query-plan/index evidence are available. Do not implement per-row or per-session N+1 parity reads. Until the gate closes, retain the existing guarded compatibility projection and fail closed on missing/divergent attempt evidence; Count Variance remains disabled.

## Context

`DEC-0098` establishes immutable child count attempts and attempt lines, while current dashboard and compatibility reads still depend on legacy session-line projections. Detail, CSV, list, and paginated rows already have a parity guard, but the dashboard needs a bounded attempt-only aggregate and status predicate that cannot silently mix attempts, overcount lines, or reintroduce blind-count facts. A per-row fallback would multiply database work with population size and make dashboard totals inconsistent with list/detail authority.

## Options considered

### Option A — Defer cutover pending one bounded attempt-only query (selected)

- Summary: Keep the parity guard and compatibility projection in place; design and review one scoped aggregate/predicate query over the current attempt and its lines, then cut over only after plan/volume evidence.
- Benefits: Avoids N+1 behavior, gives one authoritative population for counts/statuses, preserves rollback, and protects incomplete migrations.
- Failure modes: Dashboard remains on the compatibility path longer; Count Variance activation is delayed.
- Why selected: It is the only option that preserves correctness and bounded performance while attempt-line migration evidence is incomplete.

### Option B — Per-row attempt-line parity checks (rejected)

- Summary: Load or compare attempt lines separately for each dashboard row/session.
- Benefits: Small local changes and apparently direct parity.
- Failure modes: N+1 query growth, inconsistent snapshots, timeout risk, count drift, and possible leakage if row-level redaction differs.
- Why rejected: It violates the bounded dashboard-read and single-predicate parity gates.

### Option C — Immediate unguarded attempt-only cutover (rejected)

- Summary: Read dashboard aggregates directly from attempt lines without a migration/plan gate.
- Benefits: Fast authority transition.
- Failure modes: Missing `currentAttemptId`, incomplete migrated lines, mixed status semantics, duplicate aggregates, and blind-count exposure could silently misstate operational data.
- Why rejected: It removes the only safe compatibility and fail-closed boundary before evidence exists.

## Hard-gate assessment

- **Scope and authorization:** The future query must apply tenant/company/inventory-location scope and existing dashboard permission checks in the database predicate; no broad session or line hydration is allowed.
- **Status semantics:** Aggregate/status populations must use one documented current-attempt status matrix and must not count superseded, voided, or non-current attempts as active work.
- **Blind-count redaction:** Dashboard projections expose only facts authorized for the actor and state. System quantity, variance, reviewer facts, adjustment linkage, and sensitive audit facts remain redacted for blind counters.
- **Performance:** One bounded attempt-only aggregate/predicate query is required; N+1 parity is prohibited. Representative volume and reviewed `EXPLAIN (ANALYZE, BUFFERS)`/index evidence must show stable behavior for rows, counts, and dashboard profiles.
- **Recovery and scope discipline:** The compatibility guard remains reversible and fail-closed. Count Variance dashboard/task activation remains disabled until attempt, adjustment-recovery, migration, and query evidence gates pass.

## Required safeguards and open gates

- Define the exact dashboard status matrix and current-attempt selection rule, including missing lineage, terminal attempts, recount-requested state, and voided/unposted adjustment states.
- Implement one parameterized aggregate/predicate query with deterministic scoped joins and bounded projections; never issue one parity query per dashboard row.
- Provide PostgreSQL plan/volume evidence and review any required index or migration separately, including rollback and restore verification.
- Retain the existing parity guard for detail, CSV, list, page, and dashboard compatibility paths until the attempt-only query passes equivalent cardinality, digest, scope, and redaction checks.
- Test tenant/company/location isolation, denied dashboard permission, blind versus reviewer projections, mixed attempt statuses, missing/divergent lines, pagination/count parity, timeout/error states, and snapshot consistency.
- Keep Count Variance disabled while any attempt-line parity, immutable recovery, migration, or approval/reversal gate is open.

## Implementation and documentation impact

- **Code / architecture:** No immediate cutover. Future work must use one bounded attempt-only service/query and remove no guard until parity evidence is recorded.
- **Data / schema:** No schema change in this decision. Any index or projection needed by the reviewed plan requires a separate migration/data-safety review.
- **Workflow / permissions:** No source workflow or authorization change; Count Variance remains unavailable.
- **UI / mobile:** Preserve truthful dashboard status/empty/error/denied states and do not imply attempt-line authority before cutover.
- **Reporting:** Dashboard totals and predicates remain on the guarded compatibility contract until the attempt query is approved; no mixed-source totals.
- **Knowledge base / training:** No user-facing behavior change to document until the cutover is verified.
- **Tests / UAT:** Require focused parity, redaction, scope, query-plan/volume, disposable PostgreSQL, browser, and production-readiness evidence.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Define dashboard attempt status matrix and redaction projection | Inventory + Security + Reporting | Before query implementation | Open gate |
| Implement bounded attempt-only aggregate/predicate query | Inventory engineering | After matrix approval | Deferred |
| Produce reviewed PostgreSQL EXPLAIN/index and volume evidence | Data engineering + QA | Before cutover | Open gate |
| Execute disposable PostgreSQL, browser, migration/restore, and parity tests | QA + Release | Before cutover | Required |
| Reconfirm Count Variance activation gates after cutover evidence | Product Governance | After all gates | Blocked by design until verified |
| Update stock-count specs, pending plan, glossary, and KB | Mithi + Dunong | With cutover | Required |

## Evidence

- `DEC-0098-RECOUNT-ATTEMPT-IMMUTABLE-RECOVERY.md`: immutable attempt model and Count Variance recovery prerequisites.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md`: existing parity guard, legacy compatibility projection, and open dashboard attempt-line/query-plan gate.
- `DEC-0060-BLIND-COUNT-REDACTION-AND-COUNT-VARIANCE-DASHBOARD-ACCESS.md`: dashboard permission and blind-count safeguards.
- Parent-agent independent database, workflow, security, and reporting review on 2026-07-24. Requested Code Spark/GPT-5.4 reviewer identifiers were unavailable; the closest permitted GPT-5.6 fallback was used without relaxing hard gates.

## Supersession

Not superseded.
