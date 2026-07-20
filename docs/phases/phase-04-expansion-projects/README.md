# Phase IV — Expansion Projects and New Branch Opening

**Status:** Implemented Expansion workspace foundation; client UAT and release evidence remain pending
**Build authorization:** Implementation is authorized for the scoped ERP workspace. Production release still requires documented client UAT, visual QA, migration/recovery evidence, and release approval.

## Objective

Manage new restaurant sites from pipeline and feasibility through capex, construction, permits, opening readiness, handover and post-opening review.

## Planned Scope

- Site pipeline and evaluation
- Feasibility and executive approvals
- Lease, mall, legal and permit document controls
- Capex budget and project procurement
- Construction milestones, risks and change orders
- Opening readiness, handover and post-opening performance review
- Specialized Branch Expansion & Construction workstreams using the shared Work Management Engine

## Dependencies

- Company/brand/location hierarchy
- Phase III budgets and expense/payment controls where released
- Document storage and role/approval controls
- Defined project-stage and opening-readiness governance
- Shared Work Management Engine direction from `DEC-0007`

## Current Implementation Boundary

- Complete documentation structure for this phase
- Initial workflow and UI specification frameworks
- Initial data-extension, reporting, UAT and release-gate documents
- The implemented Expansion workspace uses the shared project and work-management source of truth.
- Playbooks, site projects, tasks, milestones, checklists, evidence/signoffs, lifecycle gates, permits, capex coordination, construction, readiness, punch lists, and post-opening review are scoped through the ERP services and routes.
- Client UAT, responsive visual QA, production evidence-storage decisions, and release signoff remain acceptance work, not authorization blockers for continued implementation.

## Branch Expansion & Construction Add-On

Start with:

- `BRANCH_EXPANSION_CONSTRUCTION_PRODUCT_SPEC.md`
- `workflows/branch-expansion-lifecycle-gate-workflow.md`
- `workflows/branch-expansion-calendar-timeline-milestone-workflow.md`
- `workflows/branch-expansion-risk-blocker-punchlist-workflow.md`
- `data/BRANCH_EXPANSION_CONSTRUCTION_DATA_MODEL_EXTENSION.md`
- `implementation/BRANCH_EXPANSION_CONSTRUCTION_BUILD_PLAN.md`
- `quality/BRANCH_EXPANSION_CONSTRUCTION_UAT_PLAN.md`
- `specs/branch-expansion-dashboard-ui-spec.md`
- `specs/branch-expansion-calendar-timeline-ui-spec.md`

These documents remain the policy and acceptance references for the implemented workspace. They do not authorize contractor portals, financial posting, payment release, inventory posting, or other source-module mutations outside the documented ERP boundary.

## What Must Be Finalized Before Development

1. Phase-specific business policies and owners
2. Data fields and integrations that extend the core model
3. Approval, budget, audit and exception rules
4. Detailed screens, validation, mobile behavior and reporting
5. UAT scenarios, migration impact and go-live criteria
6. Expansion gate evidence, opening-date change authority, restricted-project visibility, financial-link display rules, contractor/supplier reference policy, and punch-list closure authority
