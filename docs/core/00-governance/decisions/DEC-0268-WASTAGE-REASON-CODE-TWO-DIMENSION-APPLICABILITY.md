# DEC-0268 — Wastage Reason-Code Two-Dimension Applicability

## Metadata

- Decision ID: `DEC-0268`
- Title: Wastage reason-code two-dimension applicability
- Status: Confirmed
- Date: 2026-08-03
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I Inventory / Wastage reason codes
- Related decision brief: Parent-led reason-code applicability deliberation and challenge record (confirmed by user)

## Decision

For wastage, a reason code's eligibility must be represented by two separate
dimensions: the eligible wastage event/type and the eligible inventory/item
class. The overloaded `OperationalReasonCode.appliesTo` field must not be used
to encode, infer, or substitute for either dimension.

A wastage line may use a reason code only when the active company-scoped code is
eligible for both its selected wastage type and the item's resolved inventory
class. Empty, ambiguous, or unmapped eligibility must fail closed rather than
silently make a code universally applicable.

The following conservative F&B mappings are confirmed as the baseline seed:

| Legacy code | Eligible wastage event/type | Eligible inventory/item class |
|---|---|---|
| `SPOILAGE_EXPIRY` | `SPOILAGE_EXPIRY` | `FOOD` |
| `PREP_TRIM_LOSS` | `PREPARATION_LOSS` | `FOOD` |
| `KITCHEN_ERROR` | `PREPARATION_LOSS` | `FOOD` |
| `DAMAGED_PACKAGING` | `DAMAGE` | `FOOD`, `PACKAGING` |

These are reviewable, company-scoped seed rows—not permanent global policy—and
do not replace configurable evidence, approval, or other wastage policies.

## Context

The former single `appliesTo` value cannot reliably express that one reason may
be valid for several wastage events, several inventory classes, or a particular
combination of the two. Overloading it creates ambiguous master data, makes
validation and reporting unreliable, and risks presenting an operational-loss
reason for an incompatible item class or event.

The decision is limited to controlled wastage reason-code applicability. It does
not alter approval, evidence, stock posting, item-class taxonomy, or stock
adjustment policy.

## Options considered

### Option A — selected: separate event/type and item-class eligibility dimensions

- Summary: Maintain explicit eligibility for wastage event/type and explicit
  eligibility for inventory/item class; validate both dimensions at selection
  and submission.
- Benefits: Represents many-to-many applicability without ambiguity, supports
  precise filtering/reporting, and scales as event types or inventory classes
  expand.
- Failure modes: Incorrect legacy mapping or an incomplete active configuration
  can make a valid reason unavailable; a faulty intersection check can expose an
  incompatible code.
- Why selected: It is the confirmed scalable model and preserves a clear,
  auditable control boundary.

### Option B — rejected: retain overloaded `appliesTo`

- Summary: Continue storing one mixed-purpose value on the reason code.
- Benefits: No immediate migration or mapping work.
- Failure modes: Cannot unambiguously express two independent dimensions,
  encourages inconsistent interpretation, and makes validation/reporting
  dependent on undocumented conventions.
- Why rejected: It cannot satisfy the confirmed two-dimension control.

### Option C — rejected: unrestricted code with narrative-only guidance

- Summary: Show all active wastage codes and rely on users or reviewers to
  choose the appropriate one.
- Benefits: Lowest configuration burden.
- Failure modes: Misclassification, weak reporting, avoidable approval churn,
  and no enforceable preventive control.
- Why rejected: It weakens operational classification and does not fail closed.

## Hard-gate assessment

- Tenant and company isolation: eligibility configuration and lookup remain
  tenant/company scoped; a code from another company is never eligible.
- Server-enforced authorization: the service must evaluate active code status
  and both dimensions, rather than trusting filtered browser options.
- Inventory and audit integrity: the rule controls classification before
  submission; it does not bypass approval, evidence, immutable movement, or
  audit requirements.
- Recovery and history: existing wastage reports retain their recorded reason
  values and audit history. Legacy configuration is mapped deliberately, never
  auto-rewritten from an ambiguous `appliesTo` value.

## Required safeguards

- Validate active code, selected wastage event/type, and resolved item class in
  the server-side create/update/submit path; reject a non-intersecting pair with
  a stable user-safe validation result.
- Filter UI option lists only as a convenience; filtering is not authorization
  or validation.
- Preserve the selected reason code and relevant eligibility/configuration
  context with the wastage document or audit record so later configuration edits
  do not rewrite history.
- Use the confirmed conservative baseline mapping for `SPOILAGE_EXPIRY`,
  `PREP_TRIM_LOSS`, `KITCHEN_ERROR`, and `DAMAGED_PACKAGING`; each company must
  review and may configure its own active reason-code coverage under authorized
  master-data controls.
- Treat a missing, invalid, inactive, or ambiguous legacy mapping as
  unavailable for new wastage selection until corrected by authorized master
  data administration.
- Cover allowed and denied event/type × item-class intersections, company
  isolation, inactive codes, stale client selection, legacy mapping migration,
  audit preservation, and bounded option-list behavior in tests/UAT.

## Implementation and documentation impact

- Code / architecture: replace all wastage eligibility reads of overloaded
  `OperationalReasonCode.appliesTo` with an explicit two-dimension evaluation.
- Data / schema: the active implementation contract uses distinct
  `wastageTypes` and `inventoryClasses` attributes, with migration/rehearsal and
  a human-reviewed legacy mapping. A later physical redesign must preserve both
  dimensions independently and retain this decision's fail-closed semantics.
- Workflow / permissions: only active company-scoped codes eligible on both
  dimensions can be selected for a wastage line; existing scope, approval, and
  evidence controls remain unchanged.
- UI / mobile: reason-code options may be filtered by the selected event/type
  and line item class, with clear unavailable/validation feedback. No UI change
  is authorized by this record alone.
- Reporting: future wastage reporting may group/filter by event/type and item
  class independently; historic records must not be reclassified without an
  approved, auditable migration policy.
- Knowledge base / training: Dunong must assess and update administrator and
  warehouse/storekeeper guidance when the configuration and selection behavior
  is implemented.
- Tests / UAT: demonstrate both allowed and denied intersections and prove that
  legacy code mapping cannot silently broaden eligibility.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Define the physical schema, migration, rollback/rehearsal, and service validation design. | Implementation owner with Database and Inventory Control review | Before implementation | Pending |
| Review the confirmed baseline seed per company and map any remaining legacy wastage codes to eligible event/type and item-class dimensions. | Operations Owner / Inventory Control Owner | Before enabling new selection rules for an affected company/code | Pending company review / remaining-code mapping |
| Review unmapped, ambiguous, inactive, and historical legacy-code treatment; approve the migration runbook. | Product Owner / Operations Owner / Data Owner | Before migration | Pending |
| Assess administrator and warehouse user-facing documentation and training impact after implementation. | Dunong | When implementation is ready for UAT | Pending handoff |

## Evidence

- User-confirmed conclusion selecting the scalable two-dimension option.
- Parent-led independent deliberation and challenge round, completed before
  confirmation.
- User-confirmed conservative F&B baseline mappings for `SPOILAGE_EXPIRY`,
  `PREP_TRIM_LOSS`, `KITCHEN_ERROR`, and `DAMAGED_PACKAGING`.
- Deliberation fallback: requested Code Spark / GPT-5.4 was unavailable;
  GPT-5.6 Terra was used without relaxing the required decision protocol.
- `docs/phases/phase-01-procurement-inventory/workflows/wastage-stock-adjustment-workflow.md`.
- `docs/core/03-data/ERP_DATA_DICTIONARY.md` and
  `docs/core/03-data/DATABASE_SCHEMA.md` reason-code definitions.
- `DEC-0021` and `DEC-0036` for configurable wastage evidence and policy
  controls, which remain unchanged.

## Supersession

This record does not supersede an earlier decision record. It replaces the
single-field applicability assumption for wastage reason codes. Any future
decision changing the event/type or item-class taxonomy, historical
reclassification policy, or physical schema must reference this record.
