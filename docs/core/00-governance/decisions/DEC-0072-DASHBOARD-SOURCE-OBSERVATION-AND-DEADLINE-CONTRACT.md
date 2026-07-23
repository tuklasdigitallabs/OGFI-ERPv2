# DEC-0072 — Dashboard Source Observation and Deadline Contract

## Metadata

- Decision ID: `DEC-0072`
- Title: Dashboard Source Observation and Deadline Contract
- Status: `Confirmed and implemented — external production gates pending`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation and Phase I Operations Dashboard
- Related decision brief: Parent-led dashboard source-observation and deadline deliberation, 2026-07-23

## Decision

The dashboard read model will expose observation-only metadata: one response `assembledAt`, and `availability` plus `checkedAt` for each source that the server authorized and attempted. A source may additionally expose `dataAsOf` only when that source has a native, documented as-of meaning; these fields must not be converted into `fresh`, `stale`, or SLA claims.

Authorized source reads will be represented by lazy descriptors that return immutable result patches and settle independently under one technical per-source deadline. The deployment default is `2500 ms` and the permitted maximum is `3000 ms`, derived from the existing four-second dashboard NFR to leave time for response assembly and delivery; this is technical deployment configuration, not tenant business policy or an operational SLA. A process-wide admission controller defaults to 32 and permits no more than 64 executing dashboard source reads; a timed-out read retains its slot until its underlying work actually settles.

## Context

`DEC-0053` requires per-source isolation and enough dashboard context to avoid implying consistency the read model cannot prove. The current dashboard fan-out independently settles source promises, but eager reads mutate one shared assembly object and have no confirmed source deadline or precise timestamp semantics. A slow source can therefore consume the whole response budget, a late result can complicate partial assembly, and a generic “freshness” label can be mistaken for a source-currency guarantee.

The dashboard combines current transactional reads, aggregates, and source-specific projections. The time at which the dashboard attempted a read is not necessarily the time represented by the source data. Some sources can prove a native `dataAsOf`; others cannot. The contract must report what the system observed without inventing a freshness threshold, business SLA, or false complete total when contributors are unavailable.

## Options considered

### Option A — selected: observation-only timestamps, lazy immutable descriptors, and a bounded technical deadline

- Summary: Emit response-level `assembledAt`; emit generic `availability` and `checkedAt` only for authorized sources actually attempted; permit optional source-native `dataAsOf`; execute lazy source descriptors concurrently under a technically configured `2500 ms` default and `3000 ms` maximum; and merge only immutable returned patches after settlement.
- Benefits: Separates read-at observation from source currency; prevents unauthorized-source metadata from becoming an existence or capability signal; bounds degradation inside the four-second NFR; prevents late or failed reads from mutating shared response state; and supports useful partial dashboards without claiming completeness.
- Failure modes: Implementers may relabel `checkedAt` as freshness, synthesize `dataAsOf` from an unrelated timestamp, let timed-out work continue consuming resources, expose timeout/error detail, merge a late patch, or present a partial aggregate as complete.
- Why selected or rejected: Selected because it gives users truthful observation context and gives the server a deterministic failure boundary without creating unsupported business policy.

### Option B — rejected: fixed freshness threshold and status labels

- Summary: Compare source timestamps with one hard-coded age threshold and label dashboard sources or metrics `fresh` or `stale`.
- Benefits: Produces a simple badge and can make old-looking timestamps visually prominent.
- Failure modes: Different source processes have different currency semantics; `checkedAt` measures observation rather than data currency; a fixed threshold would silently become business policy; and a green “fresh” label could overstate consistency, reconciliation, or completeness.
- Why selected or rejected: Rejected because no approved source SLA or universal as-of semantic exists. A fixed threshold would invent policy and misrepresent sources that only support current-query observation.

### Option C — rejected: defer the contract until every source has a native as-of value or configurable SLA

- Summary: Keep the present unbounded/generic behavior and wait until source owners define data-currency SLAs and every adapter can return `dataAsOf`.
- Benefits: Avoids an interim DTO change and could eventually support source-specific service targets.
- Failure modes: Leaves the dashboard without a bounded per-source failure contract, allows one slow source to threaten the response target, and delays truthful partial-result metadata for sources that can safely participate now.
- Why selected or rejected: Rejected because source observation and execution deadlines are useful without an SLA. Configurable source freshness SLAs remain deferred and require separate policy confirmation; this decision does not define them.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** A descriptor is eligible for invocation and metadata only after server-side permission and scope authorization. Omitted unauthorized sources produce no availability, timestamp, total, or record-presence signal.
- **Server-enforced authorization:** Dashboard metadata and partial results grant no source access. Every drill-down, export, view, and workflow action continues to reauthorize in the authoritative source service.
- **Approval segregation and workflow integrity:** The contract is read-only and creates no approval, posting, self-approval, or source-state transition authority.
- **Immutable inventory ledger and audit:** Inventory values remain derived from authorized ledger/balance sources. The dashboard does not repair, post, or rewrite inventory; its inventory contribution must use a bounded aggregate projection rather than materializing an unrestricted balance set.
- **Transactional consistency and idempotency:** Returned patches are observations, not transaction snapshots across sources. The response must not claim cross-source atomicity, and no descriptor may perform a write or background workflow effect.
- **Phase scope discipline:** The contract applies to registered dashboard sources only. It does not activate deferred metrics, unrestricted analytics, or new source modules.
- **Recovery and rollback:** A failed or timed-out source yields a generic unavailable observation while unaffected authorized patches remain usable. The descriptor contract and deployment deadline can be rolled back without a business-data migration; source workspaces remain authoritative.

## Required safeguards

- Define a closed response schema. `assembledAt`, `checkedAt`, and `dataAsOf` are UTC instants in transport; the dashboard must render them explicitly in `Asia/Manila` for the current OGFI operating default.
- Capture `checkedAt` when an authorized source attempt settles as available or unavailable. It means “the dashboard checked this source at,” not “the source data is current as of.” Capture `assembledAt` when the final response model is assembled.
- Permit `dataAsOf` only where the source owner documents the timestamp's grain and meaning and the adapter obtains it natively. Do not infer it from `checkedAt`, response assembly time, an arbitrary row's `updatedAt`, or the maximum timestamp of a partial candidate list.
- Do not emit `fresh`, `stale`, “within SLA,” or “SLA breached” from these timestamps. User-visible availability remains generic; timeout, database, authorization, and internal error details must not be exposed.
- Build the source registry from lazy descriptors. After authorization, each descriptor may be invoked once and must return an immutable typed patch or a generic unavailable result; it must not mutate the shared dashboard assembly object.
- Apply the configured deadline independently to concurrently attempted sources. An unset deadline uses `2500 ms`; deployment configuration must not permit a value above `3000 ms`. Late results must be discarded, must not alter the assembled response, and should be cooperatively cancelled or bounded at the database/service layer where supported.
- Bound executing source work with validated process-wide admission (`32` default, `64` maximum). Saturated attempts fail safely before source execution, and a presentation timeout must not release its slot until the underlying work settles. This bounds accumulation but does not claim database-query cancellation; database-side termination remains a hosted verification requirement.
- Treat the deadline as an internal reliability control. Do not expose it as tenant policy, make it editable through policy settings, or promise that a source will respond within it. Any future source-specific or configurable business SLA requires a separate confirmed decision.
- For an aggregate with multiple contributors, identify the successful contributors in closed, non-sensitive provenance metadata. If any required authorized contributor is unavailable, set the aggregate `total` to `null`; do not convert the missing contribution to zero or present a successful subset as a complete total.
- Replace any dashboard inventory read that materializes an unrestricted authorized balance collection with a bounded, database-side aggregate/projection containing only the fields and candidate cap required by the registered dashboard contract.
- Preserve generic source-workspace fallback links and target-service reauthorization. Availability metadata must never be treated as a capability token.
- Record internal deadline/error telemetry without source payloads or user-visible internal reasons. Monitor timeout rate, total assembly duration, query duration, and late-work cancellation in staging and production operations.
- Test authorization-before-attempt, omission of unauthorized metadata, timestamp semantics, optional native `dataAsOf`, timezone rendering across Manila date boundaries, independent timeout/failure isolation, no late shared mutation, immutable patch merging, redaction, partial contributor provenance, `total: null`, bounded inventory queries, and the `2500 ms` default/`3000 ms` ceiling.
- Before production-readiness closure, capture authenticated external-browser evidence for desktop, tablet, and mobile degraded states, retry behavior, explicit `Asia/Manila` timestamp display, and no layout overflow. Capture staging evidence under representative pilot data that the full response meets the four-second NFR with slow, failed, and timed-out contributors, and verify the bounded inventory query plan and load behavior.

## Implementation and documentation impact

- Code / architecture: Replace eager promise entries that mutate a shared dashboard source object with authorized lazy descriptors returning closed immutable patches. Add response/source observation metadata, deadline enforcement and cancellation/late-result handling, safe provenance merge rules, and a bounded inventory aggregate adapter.
- Data / schema: No database schema or source-of-truth record change is authorized. The deadline belongs in validated deployment configuration, not the policy-settings data model.
- Workflow / permissions: No permission, scope assignment, approval route, action authority, or workflow status changes. Authorization must occur before a source is attempted or disclosed.
- UI / mobile: Replace ambiguous generic freshness wording with truthful assembled/checked/as-of labels as applicable, render timestamps explicitly in `Asia/Manila`, show generic per-source unavailability, and distinguish partial values from complete totals without pushing the action queue below the fold.
- Reporting: Dashboard observation metadata is not report reconciliation proof and does not change the reporting rule that native asynchronous read models must disclose their documented refresh time. Partial dashboard totals must not flow into exports as complete totals.
- Knowledge base / training: Dunong handoff is required after labels, partial-state copy, source coverage, and responsive behavior are implemented and verified. User guidance must explain that “checked” is not a freshness or source-access guarantee.
- Tests / UAT: Add focused contract/unit/integration tests plus authenticated external-browser and staging performance evidence for all safeguards above. Implementation remains unverified until these gates pass.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the closed observation DTO, authorized lazy descriptor registry, immutable patch merge, deadline validation, admission bound, and safe telemetry | Backend Engineering + Architecture | Before the next dashboard implementation checkpoint | Implemented; Architecture GO |
| Replace the dashboard's unrestricted inventory-balance materialization with a bounded aggregate/projection and verify its query plan | Backend Engineering + Database Engineering | Before dashboard staging performance evidence | Aggregate and executable PostgreSQL case implemented; execution/query-plan evidence pending |
| Implement explicit Manila timestamp, unavailable, and partial-total presentation | Frontend Engineering + Product Design | Before dashboard browser UAT | Implemented; browser evidence pending |
| Verify scope omission, timeout isolation, redaction, late-result disposal, contributor provenance, null-total semantics, and inventory bounds | QA + Security + Architecture | Before production-readiness closure | Architecture and Security GO; PostgreSQL execution pending |
| Capture representative staging timing/telemetry and authenticated desktop, tablet, and mobile evidence | QA + DevOps + Release Management | Before production GO consideration | Pending external gate |
| Update role-based dashboard guidance after final labels and behavior are verified | Dunong | After implementation verification | Knowledge base, glossary, and release guidance aligned; UAT briefing remains |
| Deliberate source-specific configurable freshness SLAs only if product owners establish an operational need and source-native evidence | Product Governance + source owners | Future policy trigger | Deferred; separate decision required |

## Evidence

- Parent-confirmed conclusion from independent reporting, workflow, and UX deliberation followed by an architecture challenge, 2026-07-23. The requested Spark/GPT-5.4 models were unavailable; the closest permitted GPT-5.6 specialist roles were used. The conclusion selected observation-only metadata, immutable lazy descriptors, bounded technical deadlines, partial-result safeguards, and explicit external verification gates.
- Post-implementation review initially rejected fail-open trust-policy degradation, contradictory Approval availability, missing operational telemetry, static-only inventory aggregate evidence, and unbounded timed-out source work. Remediation made trust degradation fail closed, modeled Approval as explicitly unavailable, added safe timeout/saturation/late-settlement/assembly telemetry, registered an executable PostgreSQL aggregate/dashboard boundary case, and added process-wide admission that retains timed-out slots until underlying settlement. Final Architecture and Security re-reviews returned GO with no remaining Critical/High finding.
- The complete non-database web suite passed 1,233 tests, including 54 focused dashboard/inventory tests and 8 dashboard UI tests; typecheck, lint, the 20/20 authorization manifest, production build, and `git diff --check` passed. The initial build attempts contended with an active development server's shared Next.js output and left orphaned build workers after interruption; after exact build-only process cleanup, an isolated `NEXT_DIST_DIR=.next-ogfi-build` production build compiled and completed successfully without stopping the development server. The disposable-PostgreSQL case remains locally unexecuted because `DISPOSABLE_DATABASE_ADMIN_URL` is unavailable.
- `docs/core/00-governance/decisions/DEC-0053-BOUNDED-SCOPE-AUTHORIZED-DASHBOARD-READ-MODEL.md`: confirms the bounded server-authorized, per-source degradable dashboard read model and requires timestamps that do not overclaim real-time consistency.
- `docs/core/00-governance/NON_FUNCTIONAL_REQUIREMENTS.md`: sets the initial dashboard target at no more than four seconds and requires a freshness label only when an asynchronous read model is used.
- `docs/core/04-design/design/DASHBOARD_RULES.md`: requires visible dashboard scope and last-refreshed context while keeping the action queue dominant.
- `docs/phases/phase-01-procurement-inventory/specs/dashboard-ui-spec.md`: requires compact scope/freshness context, action-first presentation, authorized drill-downs, accurate states, and responsive behavior.
- `docs/core/06-reporting/REPORTING_AND_EXPORT_SPEC.md`: distinguishes current committed transactional reads from asynchronous read models with a documented `Data refreshed at` value and requires reconciliation to authoritative records.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md`: records independent source settlement, generic safe unavailable states, and the remaining per-source deadline and browser-evidence gaps.
- `apps/web/src/server/services/dashboard.ts` and `apps/web/src/server/services/inventory.ts`: implementation evidence for lazy authorized source descriptors, immutable patches, observation metadata, validated deadline/admission controls, safe operational telemetry, partial provenance, fail-closed trust behavior, and the bounded inventory aggregate.

## Supersession

This decision is not superseded. It narrows the timestamp and execution-deadline semantics required by `DEC-0053` without changing that decision's scope, authorization, source-service, or action-first hierarchy. A later decision that introduces freshness classifications, source-specific SLAs, a materialized dashboard store, or a different response-time policy must explicitly amend or supersede this record.
