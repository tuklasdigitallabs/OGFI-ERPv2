# Phase 2 Deferred Go-Live Blockers For UAT

**Status:** Deferred for actual user UAT and release rehearsal  
**Created:** 2026-07-07  
**Scope:** Phase 2 Restaurant Operations And Food Cost  
**Decision:** These items are parked for now so implementation, demos, internal testing, and UAT preparation can continue. They are not resolved, waived, or approved for production go-live.

## Purpose

This document records Phase 2 release and go-live blockers that do not prevent the ERP from running locally or being demonstrated, but must be reviewed with users during actual UAT before Phase 2 can be represented as production release-ready.

Phase 2 covers restaurant operations and food-cost workflows, including recipes, menu costing, theoretical versus actual food cost, branch execution, food-safety logs, incidents, maintenance, reporting, exports, and related evidence controls.

## Current Boundary

Phase 2 may continue through:

- local development
- client demo review
- internal workflow testing
- sample data validation
- UAT preparation
- continued implementation

Phase 2 must not be represented as production release-ready until these deferred blockers are either completed with evidence or formally waived by authorized owners with documented mitigation.

## Deferred Blocker Register

| ID | Blocker area | What is missing | Required owner(s) | Required UAT/release evidence | Current disposition |
|---|---|---|---|---|---|
| P2-DGB-001 | Recipe library UAT | User validation of recipe list, detail, create draft, edit-by-new-version, archive, version history, permissions, and pagination behavior | Operations Owner / Kitchen Owner / QA Lead | Passed Phase 2 recipe UAT rows with recipe IDs, version IDs, screenshots/exports, audit references, and denied-access proof | Deferred to user UAT |
| P2-DGB-002 | Recipe costing accuracy | User validation that recipe cost, yield, serving, UOM conversion, supplier price basis, pending-cost lines, and target food-cost logic are correct | Operations Owner / Finance Owner / QA Lead | Cost calculation examples, accepted formula checks, ingredient-line evidence, and signed finance/operations review | Deferred to user UAT |
| P2-DGB-003 | Sub-recipe and large recipe behavior | Confirmation of approved behavior for link-only sub-recipes, large ingredient lists, revision workbook export, and any deferred recursive cost flattening or bulk import/apply behavior | Operations Owner / Product Owner / Finance Owner | UAT proof that current behavior is understood, unavailable features are acknowledged, and no unsupported bulk mutation path is exposed | Deferred to user UAT |
| P2-DGB-004 | Menu price decision boundary | Validation that menu-price decisions remain separate from recipe costing and no recipe action automatically mutates menu price, POS, inventory, finance, or approvals | Finance Owner / Operations Owner / Product Owner | Menu-price decision records, audit references, and negative test proving recipe publish/archive does not change price automatically | Deferred to user UAT |
| P2-DGB-005 | Food-cost analysis trust gate | Validation that theoretical cost uses approved recipe/menu costing and actual cost uses posted outbound inventory movements; imported/POS sales data remains warning/trust-gated until validated | Finance Owner / IT/Data Owner / Operations Owner | Sales import source evidence, trust notice screenshots, filtered report export, formula validation, and signed data-owner acceptance | Deferred to user UAT |
| P2-DGB-006 | Branch opening/closing operations | UAT for branch checklist creation, review, return/correction, close/cancel, self-review denial, and audit/status-transition history | Branch Operations Owner / QA Lead | Checklist record IDs, correction records, audit events, transition ledger rows, denied/self-review proof, and export evidence | Deferred to user UAT |
| P2-DGB-007 | Food-safety workflow | UAT for food-safety log create, review, return/correction, close/cancel, exception handling, evidence references, and no automatic inventory/wastage/incident mutation | QA / Food Safety Owner / Branch Operations Owner | Food-safety log IDs, reading values, corrective action/evidence, audit/transition rows, denied/self-review proof, and export evidence | Deferred to user UAT |
| P2-DGB-008 | Incident workflow | UAT for incident create, correction, resolve, cancel, source-record link behavior, due dates, severity, corrective action, and audit/history | Operations Owner / QA Lead / Security or Compliance Owner where applicable | Incident IDs, correction/resolution evidence, audit/transition rows, source-link proof, and export evidence | Deferred to user UAT |
| P2-DGB-009 | Maintenance workflow | UAT for maintenance ticket create, assign, schedule, correct, complete, cancel, evidence, priority, and queue/list behavior | Maintenance Owner / Operations Owner / QA Lead | Maintenance ticket IDs, assignment/schedule evidence, correction/completion/cancellation proof, audit/transition rows, and export evidence | Deferred to user UAT |
| P2-DGB-010 | Phase 2 permissions and scope | Server-side proof that Phase 2 actions obey company, brand, branch/location, role, and permission boundaries; direct URLs and exports deny unauthorized users | IT/Security Owner / QA Lead | Permission matrix, direct URL/API denial evidence, export denial evidence, and audit references | Deferred to user UAT |
| P2-DGB-011 | Phase 2 reporting and exports | Validation that Phase 2 reports preserve filters, scope, trust notices, export metadata, and source-record drilldown without replacing source records | Reporting Owner / Finance Owner / Operations Owner | Recipe costing export, food-cost analysis export, branch ops export, food-safety export, incident export, maintenance export, and export audit proof | Deferred to user UAT |
| P2-DGB-012 | Phase 2 audit and correction ledger | Proof that Phase 2 create, submit, review, return, correction, close, resolve, complete, cancel, archive, export, and denied actions write required audit and status-transition history | QA Lead / IT Owner / Operations Owner | Audit queries/screenshots, `OperationalStatusTransition` rows where applicable, correction records, actor/time/reason/evidence references | Deferred to user UAT |
| P2-DGB-013 | Mobile/tablet operational usability | Confirmation that branch, food-safety, incident, maintenance, and relevant recipe/costing review workflows remain usable on UAT devices | Operations Owner / QA Lead | Mobile/tablet screenshots, device/browser notes, completed scenario rows, and usability findings | Deferred to user UAT |
| P2-DGB-014 | Phase 2 training and enablement | Training materials and known-limit acknowledgement for Restaurant Ops users, Finance reviewers, branch users, and maintenance/incident owners | Enablement Owner / Operations Owner / Finance Owner | Training attendance, role-based quick guides, known-limit signoff, support route, and hypercare owner list | Deferred to rollout preparation |
| P2-DGB-015 | Phase 2 final release decision | Final Phase 2 owner signoff, defect disposition, deferred-scope acknowledgement, evidence manifest, and GO / NO-GO review | Product Owner / Executive Sponsor / Release Manager | Completed Phase 2 UAT evidence, defect waiver/closure list, signed release decision, and final evidence references | Deferred to final UAT signoff |

## Review Trigger

Reopen this register when one of the following starts:

- formal Phase 2 user UAT
- Restaurant Ops pilot review
- food-cost validation workshop
- staging release rehearsal for Phase 2
- Phase 2 owner signoff review
- production GO / NO-GO preparation for Restaurant Ops

## Required Review Actions

During actual Phase 2 UAT and release rehearsal:

1. Assign each deferred blocker to a named owner.
2. Confirm pilot company, brand, branch/location, recipe/menu, sales/import, and inventory scope.
3. Collect real source-record IDs and evidence references.
4. Validate calculations with user-owned examples.
5. Replace all `Pending`, `TBD`, and unchecked placeholders in Phase 2 evidence documents.
6. Record defects, waivers, and deferred behavior explicitly.
7. Run relevant report/export/status checks.
8. Confirm no Phase 2 task mutates inventory, finance, POS, or approvals outside approved workflows.
9. Capture final owner signoff before production approval.

## Non-Waiver Statement

This document is a parking register only. It does not waive controls, approve Phase 2 production deployment, prove UAT completion, satisfy finance or food-safety review, or replace owner signoff.

Any waiver during UAT must include:

- owner name and role
- business reason
- risk impact
- mitigation
- expiration or follow-up date
- explicit approval decision
- evidence reference

