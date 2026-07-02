# Branch Expansion & Construction — Build Plan

## Prerequisites

- Shared Work Management Engine is stable and passes its UAT gates.
- User/scope/attachment/activity/notification patterns are implemented or explicitly designed.
- Finance, procurement, and project links have defined read-only/control boundaries.

## Release slices

### Slice 1 — Project control baseline

- Expansion project header
- Project type/templates
- Workstreams
- Specialized board/list/dashboard
- User assignment and My Work integration
- Risks/blockers
- Project documents and activity history

### Slice 2 — Schedule and gate control

- Milestones
- Calendar
- Phase gates/evidence
- Permit tracker
- Opening-date risk indicator
- Pre-opening readiness checklist

### Slice 3 — Construction detail

- Contractor/supplier links
- Construction progress/photo log
- Punch list/defects
- Handover and stabilization tracker
- Authorized PO/PR/invoice/payment/budget reference summaries

### Slice 4 — Later enhancements

- Derived timeline/Gantt
- Controlled dependency visualization
- More detailed progress metrics
- Advanced integration with finance/project capex reporting

## Non-goals for the first build

- Full BOQ authoring
- Full construction accounting
- Critical-path automation
- Contractor login portal
- Automatic payment release or PO approval
- Public document sharing

## Verification per slice

Each slice requires focused permission, scope, audit, calendar, attachment, and workflow tests before rollout. Do not combine core shared-engine changes with broad specialized UI changes in one unreviewed release.
