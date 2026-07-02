# Decision Record — Wastage Evidence Threshold and Repeat-Loss Flags

## Metadata

- Decision ID: `DEC-0021`
- Title: Wastage Evidence Threshold and Repeat-Loss Flags
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Operations + Warehouse + Finance + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Wastage and Inventory Controls

## Decision

Implement configurable factual wastage policy flags for evidence threshold, repeat-loss detection, and high-value wastage detection.

The system evaluates these controls server-side and snapshots the evaluated policy context, matched flags, and evidence requirement state for approval, reporting, export, and audit use.

This decision is additive. It does not change `DEC-0017` separate wastage posting, `DEC-0018` full-document posted reversal, immutable inventory-ledger semantics, or `DEC-0019` stock-adjustment boundaries.

## Options considered

### Option A — selected

- Summary: Use configurable company policy values and persist evaluated factual flags on Wastage Reports.
- Benefits: Keeps policy out of page components, supports changing Operations / Finance thresholds without code edits, and gives approvers and reports stable context.
- Failure modes: Flags could be read as accusations if labels are not factual; historical records become unclear if evaluated policy facts are not snapshotted.
- Why selected: It satisfies Phase I evidence and repeat-loss visibility controls without changing approval/posting/reversal semantics.

### Option B — rejected

- Summary: Hardcode value thresholds and repeat rules in service or UI code.
- Why rejected: Evidence and escalation thresholds are operational policy values and may vary by company, location, item category, or future governance rule.

### Option C — rejected

- Summary: Defer evidence-threshold and repeat-loss controls.
- Why rejected: Phase I wastage integrity and reporting readiness require evidence requirements and high-value/repeat visibility.

## Hard-gate assessment

- Tenant, company, and current-location scope remain enforced server-side.
- Missing evidence required by evaluated policy is blocked server-side.
- Repeat/high-value flags do not auto-post, auto-reject, or hard-block a report by themselves.
- Wastage still requires approval before posting and a separate authorized `Post Wastage` action.
- Inventory balances still change only through immutable inventory movements.
- Posted wastage correction still uses full-document reversal.
- Stock Adjustment remains a separate non-posting foundation record in the current slice.

## Required safeguards

- Use additive schema changes and preserve existing records.
- Store configurable policy values as data, not UI constants.
- Snapshot evaluated policy facts on the Wastage Report.
- Show flags as factual review context.
- Include flags and evidence status in exports and audit metadata.
- Keep approval routing changes separate unless a future decision explicitly changes route resolution.

## Evidence

- `docs/phases/phase-01-procurement-inventory/workflows/wastage-stock-adjustment-workflow.md`
- `docs/phases/phase-01-procurement-inventory/specs/wastage-adjustments-ui-spec.md`
- `docs/core/00-governance/decisions/DEC-0017-WASTAGE-SEPARATE-POSTING-ACTION.md`
- `docs/core/00-governance/decisions/DEC-0018-WASTAGE-POSTED-REVERSAL.md`
- `docs/core/00-governance/decisions/DEC-0019-STOCK-ADJUSTMENT-FOUNDATION-BEFORE-POSTING.md`
- Round 1 deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
