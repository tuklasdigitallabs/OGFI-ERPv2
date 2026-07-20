# OGFI ERP — Phase II Workflow: Recipe Management

**Status:** Controlled recipe create, revision, archive, version workflow, revision workbook export, and menu-price decision slice implemented; bulk import/apply remains gated
**Purpose:** Create, review, approve, publish, supersede and retire recipes and sub-recipes.

## Business Outcome

Define a controlled, role-aware, auditable workflow that follows OGFI core scope, approvals, audit, notification, security and Modern SaaS design standards.

The current Phase II implementation exposes recipe costing, selected version history, ingredient lines, menu-price basis, food-cost analysis, CSV exports, controlled draft recipe creation, controlled edit-by-new-version revision drafts with ingredient append/remove/reorder and link-only sub-recipe lines, a read-only revision workbook export for planning larger recipe changes, controlled recipe archive, controlled recipe-version status transitions, and controlled menu-price decision records. Bulk import/apply and recursive sub-recipe costing remain gated by the approved implementation sequence.

## Primary Roles

- Requester / operational user
- Responsible manager or department owner
- Required approver(s)
- Finance / compliance / quality reviewer where applicable
- Administrator or auditor with read-only oversight

## Current Implementation Boundary

Recipe costing and control views may:

- list and filter scoped recipes, selected costing versions, ingredient lines, menu items, and price basis;
- show pending costing when supplier price history or UOM conversion evidence is missing;
- export filtered recipe and food-cost analysis rows;
- export a read-only recipe revision workbook with existing source lines, planning columns, and template rows for new ingredient or link-only sub-recipe lines;
- create a draft recipe with an initial draft version and ingredient lines when the user has recipe-management permission;
- create a revision draft from the selected costing version, including existing-line quantity/prep edits, existing-line removal, appended scoped ingredient lines, appended published sub-recipe/prep version links, and line order values, without changing the published costing basis;
- move existing recipe versions through server-enforced workflow actions when the user has the required permission;
- archive a recipe by controlled soft-archive action only when no open recipe version is still in draft, review, returned, or approved status;
- create and progress menu-price decision records, with the actual effective-dated price inserted only on authorized apply;
- derive theoretical cost without mutating inventory, POS sales, finance, or approval-source records.

Recipe costing and control views must not:

- edit, reopen, bulk-supersede, archive, or delete recipes outside the controlled lifecycle;
- import or apply workbook rows directly to recipe records;
- mutate `RecipeLine`, `MenuItem`, inventory, POS sales, finance, or approval-source records;
- switch the active costing version except through authorized recipe-version publish;
- post inventory, sales, finance, wastage, or approval records.

## Required Controlled Lifecycle

Recipe CRUD must use an immutable version model. Published historical versions are not edited in place; a cost-impacting edit creates a new draft version.

```text
Draft version → Submitted → Under Review → Approved → Published
                    ↘ Returned / Rejected / Cancelled

Published → Superseded by a later published version
Recipe record → Archived only by controlled soft-archive action
```

## Required Workflow Sections Still To Finalize

1. Trigger and eligibility
2. Required fields and attachments
3. Scope: company, brand, branch, warehouse, project and department
4. Approval route and delegated authority
5. Exception, rejection, cancellation and reversal paths
6. Notification and escalation events
7. Data and audit records created
8. Downstream inventory, financial, workforce, project or integration impact
9. Desktop, tablet and mobile actions
10. Reports and UAT scenarios

## Required CRUD Safeguards

- Server-side tenant, company, brand, location, role, and scope checks for every write.
- No self-approval for cost-impacting recipe, menu-price, or active-version changes.
- Transactional publish that activates one version and supersedes the prior published version without leaving two active costing bases.
- Menu-price mutation policy: separate controlled menu-price decision command; recipe publish does not automatically change menu prices.
- Required audit events for recipe created, version drafted, line changed, submitted, returned, approved, published, superseded, archived, price changed, and reopen/cancel if allowed.
- Concurrency protection for version publishing and menu-price changes.
- No inventory ledger, POS sales, finance, or approval-source mutation from ordinary recipe read screens.

## Non-Negotiable Controls

- No user may act outside assigned scope.
- Important actions require a timestamped audit event.
- Approval, financial, compliance or inventory-impacting actions must not be silently overwritten.
- Free-text comments do not replace structured fields, reason codes or evidence where those are required.
- Core document and security rules override this framework if a conflict exists.

## Open Decisions

Use `../implementation/PHASE2_DECISION_REGISTER.md` to record phase-specific policy decisions before this workflow is marked build-ready. `II-008`, `II-009`, and `II-010` are confirmed by `DEC-0035`; remaining open items should be recorded as new decisions rather than reopening recipe/menu-price source-of-truth policy.
