# DEC-0069 — Closed Receiving Follow-up Dashboard Drilldown Profile

## Metadata

- Decision ID: `DEC-0069`
- Title: Closed Receiving Follow-up Dashboard Drilldown Profile
- Status: `Confirmed and implemented — production-gate verification pending`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation and Phase I Overview / Receiving
- Related decision brief: Parent-confirmed Receiving follow-up deliberation, 2026-07-23; governed by `DEC-0053`, `DEC-0055`, and `DEC-0024`

## Decision

Under `DEC-0055`, approve the closed, source-owned, read-only Receiving dashboard profile `receiving-follow-up-v1` and rename the visible dashboard concept from **Receiving Variance** to **Receiving Follow-up**. Under the current authorized tenant and company and the selected receiving location, the canonical profile predicate is exactly:

```text
(status IN [DRAFT, POSTING] AND discrepancyFlag = false)
OR status = POSTED_WITH_DISCREPANCY
OR (
  discrepancyFlag = true
  AND status IN [DRAFT, POSTING, POSTED, POSTED_WITH_DISCREPANCY, REVERSING]
)
```

The predicate excludes `REVERSED`, `CANCELLED`, `REJECTED`, any unlisted present status, and any future status unless a later confirmed decision adds it. Dashboard count and candidates, profile count and pages, and profile export must resolve this same server-owned base predicate. The profile may apply only a bounded, normalized header search within that population; it must use header-only projection, server pagination, and a server-derived inclusion reason.

The profile list exposes no create, post, reverse, discrepancy-resolution, or other mutation control. Direct receipt detail and every source action independently authorize current scope, permission, state, segregation, inventory, idempotency, and audit requirements.

## Context

The existing dashboard label **Receiving Variance** is inaccurate because the displayed population includes clean unposted drafts and receipts currently posting, not only posted discrepancies. The existing discrepancy clause also excludes only `REVERSED`, which can admit terminal or future lifecycle states that were never reviewed for follow-up. A generic workspace link or broad `discrepancyFlag = true` condition therefore cannot serve as the production drilldown contract.

Receiving follow-up is an operational read aid across four distinct circumstances: an unposted draft, posting in progress, a recorded discrepancy, or a discrepancy-bearing reversal in progress. It is not a discrepancy-resolution workflow. Receipt lines, quantities, evidence, posting, reversal, Purchase Order effects, and inventory movements remain authoritative in Receiving detail and domain services.

## Options considered

### Option A — selected: closed `receiving-follow-up-v1` with explicit allow-list and read-only profile

- Summary: Use the exact status-and-discrepancy predicate above under selected receiving-location scope, with one shared resolver for dashboard/count/page/export behavior, constrained header search, server-derived inclusion reason, and no profile mutations.
- Benefits: Makes the metric and destination truthful; prevents terminal and future status leakage; distinguishes routine unposted work from discrepancy and reversal follow-up; supports bounded list/export parity; and preserves Receiving and inventory authority at the source.
- Failure modes: Predicate copies can drift; `POSTED_WITH_DISCREPANCY` can be lost when its flag is inconsistent; a broad flag clause can re-admit terminal/future states; client-supplied reason text can misclassify rows; line-heavy projections can leak or overload the list; or profile actions can be mistaken for source authority.
- Why selected: It is the only option that passes closed-profile, scope, lifecycle, least-data, visible-copy, and inventory-control hard gates.

### Option B — rejected: retain “Receiving Variance” and the current broad discrepancy condition

- Summary: Keep the current label and include drafts/posting/posted-discrepancy plus every flagged receipt except `REVERSED`.
- Benefits: Minimal implementation change.
- Failure modes: The label misstates clean draft/posting work as variance; `CANCELLED`, `REJECTED`, or a future flagged status may enter the population; and the view appears to promise discrepancy resolution that it does not provide.
- Why selected or rejected: Rejected because the population and label are semantically unsafe and not closed against lifecycle expansion.

### Option C — rejected: discrepancy-only profile

- Summary: Include only `POSTED_WITH_DISCREPANCY` or `discrepancyFlag = true` receipts.
- Benefits: A narrower population that aligns more closely with the old variance label.
- Failure modes: Omits clean unposted drafts and active posting follow-up already represented by the dashboard; a flag-only predicate still needs an exact status allow-list; and it changes the confirmed operational purpose.
- Why selected or rejected: Rejected because it does not represent the full Receiving follow-up population.

### Option D — rejected: generic Receiving workspace filters or action-enabled profile

- Summary: Forward status, discrepancy, scope, search, filter, or token inputs to the ordinary Receiving workspace and show its create/post/reverse controls in the drilldown.
- Benefits: Reuses existing workspace behavior with fewer source-specific components.
- Failure modes: Client inputs can redefine or widen the metric; count/page/export semantics can diverge; users may interpret navigation as action authority; and stale or unauthorized receipts can expose or execute source actions without a clear reauthorization boundary.
- Why selected or rejected: Rejected because `DEC-0055` requires a closed source profile and because a dashboard read must not become a Receiving capability.

### Option E / defer — rejected: leave Receiving without a drilldown

- Summary: Keep the card non-navigable until a future dashboard redesign.
- Benefits: Avoids immediate list, search, export, and copy work.
- Failure modes: Leaves a visible operational metric without a truthful bounded destination even though an exact safe population and read contract are now confirmed.
- Why selected or rejected: Rejected for this checkpoint. Activation still remains conditional on implementation and all required gates.

## Hard-gate assessment

- **Tenant, company, and selected-location isolation:** Every dashboard, count, candidate, page, search, and export query applies exact current `tenantId`, `companyId`, and `receivingLocationId = selected location`. No URL, profile input, search term, record field, or dashboard payload may select or widen scope.
- **Server-enforced authorization:** `receiving-follow-up-v1` is a closed server allow-list value, not a capability. Profile list and export require current Receiving read/export authority. Direct detail and create, post, reverse, or other actions independently reauthorize the target and current session.
- **Approval, procurement, and workflow integrity:** The profile neither changes Goods Receipt nor Purchase Order status nor resolves a discrepancy. Existing receivability, lifecycle, discrepancy validation, and Purchase Order balance controls remain authoritative.
- **Immutable inventory ledger and audit trail:** The profile cannot post or reverse inventory. Receiving posting and reversal retain their transactional location locks, source-event idempotency, immutable movement, Purchase Order update, audit, and reversal-lineage controls.
- **Transaction consistency and idempotency:** This decision adds a bounded read contract only. A row that changes status after listing must be re-read and reauthorized by the destination; list presence never makes a stale post or reversal valid.
- **Phase scope and recovery:** This is limited to Phase I Overview navigation and Receiving read surfaces. The profile can be disabled or removed without changing receipt, Purchase Order, movement, or audit data. No schema or backfill is authorized.

## Canonical inclusion reasons and copy

The server derives one primary inclusion reason after applying the canonical predicate. Client code must not accept, infer, or override it. Precedence is:

1. `REVERSING` → **Reversal in progress**.
2. `POSTED_WITH_DISCREPANCY` or `discrepancyFlag = true` → **Discrepancy recorded**.
3. `POSTING` → **Posting in progress**.
4. remaining eligible `DRAFT` → **Unposted draft**.

The status remains visible alongside this reason. User copy must communicate:

- **Unposted draft:** the receipt has not posted; open authoritative detail to review it and post only if separately authorized.
- **Posting in progress:** processing is underway; verify the authoritative result and do not infer that retrying is safe from the list.
- **Discrepancy recorded:** the receipt has a discrepancy condition; detail contains the authoritative receiving facts and available source actions.
- **Reversal in progress:** reversal processing is underway; follow its authoritative receipt state.

No label, empty state, help text, or export metadata may call this a discrepancy-resolution queue or imply that the profile itself fixes quantities, evidence, Purchase Order balances, or inventory.

## Required safeguards

- Register only `receiving-follow-up-v1` for this destination. Reject or safely ignore unknown profiles without falling back to ordinary Receiving filters or a generic dashboard-query interpreter.
- Define one shared canonical base predicate and use it for the dashboard metric, bounded dashboard candidates, profile authorized total, profile page query, and CSV export. Any optional search is an additional narrowing `AND`, never a replacement for the base predicate or scope.
- Treat `POSTED_WITH_DISCREPANCY` as included even if a legacy or inconsistent row has `discrepancyFlag = false`. Restrict the independent `discrepancyFlag = true` branch to `DRAFT`, `POSTING`, `POSTED`, `POSTED_WITH_DISCREPANCY`, and `REVERSING` only.
- Exclude `REVERSED`, `CANCELLED`, `REJECTED`, all unlisted statuses, and future statuses by allow-list. New lifecycle values do not inherit profile membership automatically.
- Use bounded deterministic server pagination with a stable unique record-ID tie-breaker, an authorized total, safe page bounds, and the same order for repeated requests. Do not browser-slice an unbounded result.
- Keep list and export projections header-only: receipt identity/reference, status, discrepancy flag, server-derived inclusion reason, supplier display name, Purchase Order reference, receiving-location display, and non-sensitive receipt timestamps needed for ordering/context. Do not fetch or return lines, quantities, discrepancy narrative/evidence, movement details, approval internals, mutation inputs, or audit payloads.
- Permit only a trimmed, length-bounded, server-normalized search across approved header identifiers: Goods Receipt reference, Purchase Order reference, and supplier legal/trading name. Search must remain inside the canonical predicate and selected scope; raw status, discrepancy, scope, sort, filter, token, or inclusion-reason overrides are not accepted.
- Derive inclusion reason from current server-owned status and discrepancy flag using the confirmed precedence. Use the same reason in the page and export; never trust query or client reason text.
- Render the profile as a read-only list. It may provide detail navigation, constrained search, paging, and authorized export, but no Create Receipt, Post Receipt, Reverse Receipt, or inline discrepancy-resolution control.
- Reauthorize direct detail and every source action independently. Revoked scope, missing record, status change, completed/reversed lifecycle, concurrent posting, or insufficient permission must produce a safe denied/stale outcome without unauthorized existence or line-detail leakage.
- Preserve source receiving validation, discrepancy reconciliation, Purchase Order outstanding-quantity integrity, idempotent ledger posting, inventory-location serialization, linked reversal, privileged controls, and audit behavior.
- Test the exact three-branch predicate, every included and excluded status/flag combination, future-status fail-closed behavior, selected-location and tenant/company boundaries, role/export permission boundaries, dashboard/count/candidate/page/export parity, search normalization and non-broadening, deterministic pagination, header-only projection, inclusion-reason precedence, raw-override resistance, read-only UI, safe stale/denied targets, and independent post/reverse authorization.

## Implementation and documentation impact

- Code / architecture: Add a source-owned Receiving profile resolver shared by dashboard, count, candidates, page, and export. Keep it separate from ordinary Receiving workspace filters and source commands.
- Data / schema: None. Existing Goods Receipt status, discrepancy flag, header relations, and timestamps are sufficient.
- Workflow / permissions: No Receiving permission, state transition, discrepancy rule, posting authority, reversal authority, Purchase Order effect, or inventory authority changes. The profile grants read navigation only.
- UI / mobile: Rename all affected visible dashboard/drilldown copy from **Receiving Variance** to **Receiving Follow-up**. Provide a responsive, paginated, searchable header list with status, server reason, scope context, safe loading/empty/error/denied/stale states, and detail links. Do not render create/post/reverse controls in the profile.
- Reporting: Profile CSV export uses the identical selected-scope base predicate, optional normalized search, header-only projection, deterministic order, inclusion reason, existing export permission, and export-audit controls.
- Knowledge base / training: **Dunong handoff required after verified implementation.** Update Overview and Receiving guidance to use **Receiving Follow-up**, explain the four inclusion reasons and selected receiving-location scope, and state that the list does not resolve discrepancies or grant post/reverse authority.
- Tests / UAT: Focused service, dashboard, export, route, and responsive surface tests must cover every safeguard. Disposable-database, authenticated-browser, and hosted gates remain separate production-readiness requirements.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the closed resolver, exact predicate, shared dashboard/count/page/export queries, header search, server pagination, inclusion reasons, and visible rename | Backend + Frontend Engineering | Before enabling the destination | Complete locally |
| Independently verify scope, permission, predicate parity, least-data projection, export audit, direct-target reauthorization, and absence of profile mutations | Security + QA + Architecture | Before checkpoint completion | Complete locally; final re-reviews accepted with no Critical/High finding |
| Run production-representative PostgreSQL tests for paging/search consistency and status changes during follow-up reads | Database + QA | Before Workspace 1 production-ready claim | Pending disposable-database gate |
| Verify dashboard-to-profile navigation, copy, reasons, search, paging, export, empty/error/denied/stale states, and absence of actions at desktop, tablet, and mobile widths | Frontend + QA | Before Workspace 1 production-ready claim | Pending browser gate |
| Validate hosted deploy/rollback, export delivery/audit, observability, backup/recovery, and safe profile disablement | DevOps + Release | Before production release | Pending hosted gate |
| Assess and update user-facing help, release-note impact, and training | Dunong | After verified implementation | Knowledge base and glossary updated; release-note/training impact assessed as this checkpoint proceeds |

## Evidence

- Parent-confirmed conclusion, 2026-07-23: approve read-only `receiving-follow-up-v1`; rename Receiving Variance to Receiving Follow-up; use clean `DRAFT`/`POSTING`, `POSTED_WITH_DISCREPANCY`, and the exact discrepancy-flag status allow-list; exclude terminal and future statuses; require selected receiving-location scope, shared predicate parity, header-only pagination/search, server inclusion reasons, source reauthorization, safe copy, and no profile actions.
- Independent product/workflow, architecture, security, and QA council analyses converged on the selected option and safeguards. No lifecycle, authorization, inventory, or data-integrity blocker remained after the exact allow-list and read-only boundary were applied.
- Requested Code Spark and exact GPT-5.4/GPT-5.4-mini models were unavailable in the active toolset. The Decision Chair used the closest permitted GPT-5.6 role specialists. This fallback did not relax any hard gate, safeguard, or evidence requirement.
- `docs/core/00-governance/decisions/DEC-0053-BOUNDED-SCOPE-AUTHORIZED-DASHBOARD-READ-MODEL.md`: bounded dashboard reads, source isolation, and direct-target reauthorization.
- `docs/core/00-governance/decisions/DEC-0055-CLOSED-SERVER-OWNED-DASHBOARD-DRILLDOWN-PROFILES.md`: closed allow-list, source predicate, pagination/export parity, raw-input resistance, and read-only navigation contract.
- `docs/core/00-governance/decisions/DEC-0024-GOODS-RECEIPT-REVERSAL.md`: eligible reversal states, linked counter-movements, Purchase Order restoration, audit, and idempotent reversal controls.
- `apps/web/src/server/services/receiving.ts`: implemented source-owned membership/predicate, count/candidates, page/search, inclusion reason, export projection, and authoritative detail/post/reversal services.
- `apps/web/src/server/services/dashboard.ts` and `apps/web/src/app/(app)/dashboard/page.tsx`: implemented Receiving Follow-up label/card/report navigation and differentiated candidate priority.
- `apps/web/src/app/(app)/receiving/page.tsx`, `apps/web/src/app/(app)/receiving/[id]/page.tsx`, and `apps/web/src/app/(app)/receiving/export/route.ts`: current source list, detail/actions, and export surfaces to keep authoritative or align to the closed profile as applicable.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md`: Overview remains in progress and production database, browser, and hosted gates remain open.
- `AGENTS.md` sections 4-9 and 13: scope, server authorization, receiving discrepancy and PO integrity, immutable ledger, idempotency, visible-surface, testing, and decision hard gates.

## Pending production-readiness evidence

This record confirms the profile contract and its local implementation; it does not prove Workspace 1 production-ready. Keep these gates open in the implementation plan until evidence is captured:

- disposable PostgreSQL verification for predicate/search/page/export consistency under concurrent receipt lifecycle changes and for source action reauthorization after a stale list read;
- authenticated responsive-browser evidence for navigation, scope context, reason/copy accuracy, constrained search, pagination, export, empty/loading/error/denied/stale states, and absence of create/post/reverse controls;
- hosted deployment, rollback/profile-disablement, export audit/delivery, observability, backup, and recovery verification.

## Supersession

This decision is not superseded. It adds Receiving Follow-up under `DEC-0055` and supersedes the former **Receiving Variance** dashboard meaning and broad `discrepancyFlag = true AND status != REVERSED` population for this dashboard card/profile only. It does not change Goods Receipt lifecycle, discrepancy, posting, reversal, Purchase Order, inventory, or ordinary Receiving workspace behavior. Any new included status, line-level profile, discrepancy-resolution control, or action-enabled dashboard destination requires a new confirmed decision that explicitly amends or supersedes this record.
