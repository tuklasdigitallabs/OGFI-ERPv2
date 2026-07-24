# DEC-0097 — Receiving Register Accepted-Value Filter Deferral

## Metadata

- Decision ID: `DEC-0097`
- Title: Receiving register accepted-value filter and cost-visibility deferral
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Receiving / Inventory and Reporting workstreams
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Receiving register and exports
- Related decision brief: Parent-agent Receiving accepted-value council review (confirmed 2026-07-24)

## Decision

Do not expose or add an operative accepted-value URL parameter, UI control, or ordinary CSV behavior yet. Accepted-value filtering remains a Phase C item until the authorized cost-permission boundary, receipt aggregate definition, currency conversion/handling, null unit-cost semantics, and filtered-CSV context are explicitly approved and representative PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` and volume evidence is available. A separate implementation decision must close these gates before release.

## Context

The Receiving register's existing filters are read-only but still affect operational visibility and exports. “Accepted value” can mean different aggregates (accepted quantity multiplied by unit cost per line, receipt total, or a currency-normalized amount), and received lines may have nullable unit cost or mixed currencies. Cost visibility is also permission-sensitive and must not be inferred from a generic receiving-list permission. Adding a range filter before these semantics are settled could leak financial information, create incomparable totals, or make page rows, counts, pagination, and CSV disagree. The query must remain bounded at realistic receipt-line volume.

## Options considered

### Option A — Defer accepted-value filtering pending policy and query evidence (selected)

- Summary: Keep accepted-value filtering absent and non-operative until cost permission, aggregate, currency/null, CSV, and PostgreSQL plan/volume gates are confirmed in a separate decision.
- Benefits: Prevents financial-information leakage and misleading comparisons, preserves the current shared register contract, and keeps the visible surface truthful.
- Failure modes: Users cannot yet narrow receipts by accepted value; a future policy and implementation slice remain required.
- Why selected: The definition changes reporting meaning and authorization, so it cannot be safely inferred from existing receipt or inventory fields.

### Option B — Filter by raw receipt-line accepted quantity × unit cost (rejected for now)

- Summary: Compute a numeric line total from accepted quantity and nullable unit cost, then filter receipts by that value.
- Benefits: Simple implementation for single-currency, fully-costed lines.
- Failure modes: Null costs, discounts/adjustments, mixed currencies, and receipt-level aggregation remain undefined; raw cost values could be disclosed to unauthorized users; multi-line receipts could be counted inconsistently.
- Why rejected for now: It invents financial semantics and lacks cost-permission and data-quality safeguards.

### Option C — Add a company-currency receipt aggregate and range filter (rejected for now)

- Summary: Normalize line values to company currency and filter by the receipt aggregate, with complete receipt context in CSV.
- Benefits: Comparable ranges and reconciliation-friendly exports.
- Failure modes: Requires approved exchange-rate source/date policy, null-cost treatment, aggregate definition, permission boundary, schema/query design, and performance evidence; users may expect line-level values instead.
- Why rejected for now: These policy and technical dependencies are not confirmed and would be difficult to reverse after release.

## Hard-gate assessment

- **Tenant/company/brand/location isolation:** Any future value predicate must run only against the authorized receipt/line population and must not permit cross-company currency or cost joins.
- **Authorization and confidentiality:** Cost visibility and filtering require an explicit permission boundary; lack of permission must not reveal values through controls, counts, option labels, error messages, CSV, or timing-sensitive behavior.
- **Data integrity and audit:** This is read-only, but the aggregate and currency treatment must be stable, reproducible, and suitable for audit/reconciliation; nullable costs cannot be silently treated as zero without policy.
- **Visible-surface truthfulness:** No accepted-value URL, input, range hint, or export claim is presented while semantics and authorization remain unresolved.
- **Performance and recovery:** Representative PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` plans and volume tests are required for rows, counts, pagination, and ordinary CSV. Any required index or materialized aggregate requires its own reviewed schema decision and rollback path.
- **Phase scope:** This decision is limited to the ordinary Phase I Receiving register and does not change receiving workflow, inventory posting, valuation, or accounting policy.

## Required safeguards

- Obtain explicit approval for the cost permission/role boundary, including whether users without cost visibility may use a coarse range filter at all and how denied requests fail safely.
- Define the authoritative accepted-value aggregate: line-level versus receipt-level, which quantity field is used, treatment of discounts/charges, and handling of receipts with multiple currencies.
- Define currency behavior, including company currency, exchange-rate source/date, rounding, and whether mixed-currency receipts are excluded, converted, or flagged.
- Define nullable unit-cost semantics. Do not silently coerce null to zero unless the approved policy says so; document incomplete-cost behavior in rows, counts, and CSV.
- Confirm whether filtered CSV contains complete receipt context or only matching lines, and ensure page rows/counts/pagination use the same documented population.
- Use one parameterized value predicate for rows, counts, tabs, pagination, and ordinary CSV. Add tests for denied cost access, null costs, mixed currencies, boundary values, malformed ranges, foreign scope, multi-line aggregates, and parity.
- Produce representative PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` and volume evidence for the chosen query. Do not add an index or persisted aggregate without a separate migration/data-safety review.

## Implementation and documentation impact

- **Code / architecture:** No code or query-contract change in this decision. A future Phase C slice must extend the normalized Receiving filter contract only after all gates close.
- **Data / schema:** No schema change now. Exchange-rate, aggregate, or persisted-value changes require separate data and migration decisions.
- **Workflow / permissions:** No lifecycle or posting change; cost visibility must be explicitly authorized before any future filter.
- **UI / mobile:** Keep accepted-value controls absent or clearly documented as pending; do not ship a passive range input.
- **Reporting:** Accepted-value CSV semantics and currency presentation are intentionally unresolved.
- **Knowledge base / training:** Do not promise accepted-value filtering, totals, or cost ranges until the Phase C decision is confirmed.
- **Tests / UAT:** Authorization, null/currency, aggregate, parity, query-plan, disposable PostgreSQL, and responsive-browser evidence are mandatory in the future Phase C checkpoint.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Approve cost permission and denied-access behavior | Security + product owner | Before Phase C implementation | Open prerequisite |
| Define accepted-value aggregate and quantity/cost inputs | Reporting + Receiving owner | Before Phase C implementation | Open prerequisite |
| Define currency, exchange-rate, rounding, and null-cost semantics | Finance/reporting + data engineering | Before Phase C implementation | Open prerequisite |
| Confirm filtered CSV context and page/count parity | Reporting/product owner | Before Phase C implementation | Open prerequisite |
| Produce PostgreSQL EXPLAIN and representative volume evidence | Data engineering | Before UI/contract activation | Open prerequisite |
| Record implementation decision and update UI/spec/KB | Mithi + Dunong + Receiving engineering | After all prerequisites | Deferred |

## Evidence

- `DEC-0094-RECEIVING-REGISTER-FILTER-CONTRACT.md`: phased filter contract and explicit accepted-value deferral.
- `DEC-0096-RECEIVING-REGISTER-ITEM-FILTER-DEFERRAL.md`: separate item-filter CSV and query-plan gate; accepted-value semantics remain independent.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md`: Receiving register value-filter and query-plan checkpoints.
- Parent-agent independent workflow, security, data, and reporting reviews and challenge round on 2026-07-24. Requested Code Spark/GPT-5.4 reviewer identifiers were unavailable; the closest permitted GPT-5.6 fallback was used without relaxing hard gates.

## Supersession

Not superseded.
