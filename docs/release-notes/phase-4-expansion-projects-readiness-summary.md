# OGFI ERP Release Notes — Phase 4 Expansion Projects Readiness Summary

**Release date:** Pending client UAT execution and owner signoff  
**Audience:** Expansion managers, project managers, operations leads, construction coordinators, executives, administrators, auditors, and implementation leads  
**Affected locations / roles:** Users with scoped project, expansion, reporting, export, or administration access

## What changed

- Expansion Dashboard now shows branch-opening portfolio status, schedule risk, linked source-record counts, recent activity, and report rollups.
- Site Pipeline now uses real scoped project records for branch openings, relocations, renovations, kitchen upgrades, warehouse/commissary projects, major equipment replacement, and mall compliance projects.
- Feasibility now tracks sales, rent, capex, ROI, payback, NPV, IRR, assumptions, evidence, and executive review status without creating official finance approvals.
- Capex & Procurement now tracks project packages, budget estimates, committed/actual source-reference amounts, awards, responsible parties, and evidence without approving capex, mutating budgets, issuing POs, or releasing payments.
- Lifecycle Gates now seed and track standard branch-opening gate milestones with evidence-required controlled status changes.
- Permits & Documents now tracks permit, lease, mall, design, inspection, certification, and compliance requirements using shared project tasks.
- Construction Board now tracks workstreams, areas, responsible parties, progress, blockers, evidence references, and handover status.
- Opening Readiness now tracks checklist-backed readiness tasks across operations, HR, IT, marketing, permits, inventory, equipment, finance/cash, and compliance.
- Punch List now tracks defects, snags, inspection findings, rectification items, handover exceptions, and warranty follow-up with evidence-required closure.
- Post-Opening Review now tracks 30/60/90-day stabilization, target and actual sales, food cost, labor cost, guest count, issues, stabilization score, source references, and evidence-required closure without posting sales or changing source records.
- Expansion Portfolio CSV export is available from the Expansion Dashboard and the Reports library where the user has project/export access.
- Knowledge-base and training content is available for Phase 4 expansion workspace review.

## What you need to do

- Run Phase 4 UAT using a realistic branch-opening or renovation project.
- Confirm role and scope visibility for expansion managers, project contributors, read-only reviewers, and restricted-project users.
- Verify lifecycle gate, permit/document, construction, opening-readiness, and punch-list evidence requirements.
- Verify feasibility review assumptions and completion evidence, then confirm Finance remains the source of truth for approved capex and budgets.
- Verify capex/procurement package evidence and exception formulas, then confirm Finance and Procurement remain the source of truth for budgets, POs, AP, and payments.
- Verify post-opening review formulas and evidence, then confirm POS/sales, Finance, Inventory, Workforce, Procurement, and Admin remain the source of truth for operating records.
- Verify report rollup formulas using created test records.
- Export the Expansion Portfolio CSV and confirm metadata, scope, checksum header, and source-boundary columns.
- Confirm linked source records remain controlled by their proper modules.

## Important notes

- Expansion is a project coordination layer. It does not approve Purchase Orders, release payments, receive inventory, create branch records, post journals, hire employees, or operate a contractor portal.
- Finance, purchasing, receiving, inventory, workforce, and administration records remain source-of-truth in their own modules.
- Completing an Expansion task does not mutate linked ERP source records.
- Binary evidence upload/download depends on the approved controlled attachment service. Evidence-reference fields remain valid where binary upload is not enabled.
- Final production readiness still requires client UAT evidence, permission review, training completion, and owner signoff.

## Learn more

- `docs/knowledge-base/projects/managing-expansion-projects-and-opening-readiness.md`
- `docs/training/phase-4-expansion-projects-quick-start.md`
- `docs/phases/phase-04-expansion-projects/quality/PHASE4_UAT_SCENARIOS.md`
- `docs/phases/phase-04-expansion-projects/quality/BRANCH_EXPANSION_CONSTRUCTION_UAT_PLAN.md`

## Support

Raise Phase 4 UAT defects, permission gaps, evidence issues, source-boundary confusion, or training gaps through the ERP implementation owner and the Release Readiness evidence register.
