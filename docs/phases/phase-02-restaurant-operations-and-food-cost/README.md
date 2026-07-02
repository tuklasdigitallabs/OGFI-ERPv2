# Phase II — Restaurant Operations and Food Cost

**Status:** Planned documentation framework with Marketing Operations add-on included for review
**Build authorization:** Do not begin implementation until the detailed phase workflow, data, UI, reporting, UAT and decision documents are reviewed and marked build-ready.

## Objective

Connect controlled inventory to recipes, menu costing, food-cost analysis, daily branch execution, maintenance, incidents, and food-safety controls.

Marketing Operations planning is included in this phase folder because it coordinates branch-facing campaigns, promotions, new-item launches, creative work, rollout readiness, and calendar conflicts with restaurant operations.

## Planned Scope

- Recipe and sub-recipe management
- Menu-item costing and version history
- Theoretical versus actual food-cost analysis
- Branch opening and closing controls
- Operational incidents and corrective actions
- Maintenance requests and equipment history
- Food-safety, temperature, sanitation and compliance logs
- Marketing calendars, campaigns, promotions, new-item launches, creative production, and branch rollout tracking

## Dependencies

- Phase I inventory ledger, location model, item master and supplier price history
- POS sales integration or a reliable sales import
- Recipe / yield policy decisions
- Branch operational owners and escalation rules
- Shared Work Management Engine direction from `DEC-0007`

## What This Folder Establishes Now

- Complete documentation structure for this phase
- Initial workflow and UI specification frameworks
- Initial data-extension, reporting, UAT and release-gate documents
- Required decisions to turn the phase into a build-ready scope
- Marketing Operations planning documents under `marketing-operations/`

## Marketing Operations Add-On

Start with:

- `marketing-operations/MARKETING_OPERATIONS_PRODUCT_SPEC.md`
- `marketing-operations/workflows/marketing-campaign-promotion-new-item-workflow.md`
- `marketing-operations/workflows/marketing-calendar-workflow.md`
- `marketing-operations/data/MARKETING_OPERATIONS_DATA_MODEL_EXTENSION.md`
- `marketing-operations/implementation/MARKETING_OPERATIONS_BUILD_PLAN.md`
- `marketing-operations/quality/MARKETING_OPERATIONS_UAT_PLAN.md`
- `marketing-operations/specs/marketing-calendar-ui-spec.md`
- `marketing-operations/specs/marketing-kanban-board-ui-spec.md`

These documents are planning and review inputs only. They do not authorize marketing code, schema, migrations, UI, routes, services, dependencies, deployment, or production campaign/promotion behavior.

## What Must Be Finalized Before Development

1. Phase-specific business policies and owners
2. Data fields and integrations that extend the core model
3. Approval, budget, audit and exception rules
4. Detailed screens, validation, mobile behavior and reporting
5. UAT scenarios, migration impact and go-live criteria
6. Marketing approval routes, branch/date scope, promotion conflict rules, asset controls, calendar publishing policy, and post-campaign reporting sources
