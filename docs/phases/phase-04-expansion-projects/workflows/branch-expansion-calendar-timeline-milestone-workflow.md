# Branch Expansion Calendar, Timeline, and Milestone Workflow

## Purpose

Provide daily scheduling visibility and executive schedule-risk visibility without treating a Kanban board as a complete project schedule.

## Calendar events

The expansion calendar should support:

- Target opening date
- Lease/signing dates
- Mall submission deadlines
- Permit application, inspection, expiry, and renewal dates
- Design approval dates
- Contractor mobilization
- Construction start/finish
- Equipment delivery/installation
- Utility activation
- POS/IT readiness
- Hiring and training
- Marketing launch/soft opening/grand opening
- Handover and post-opening review

## Calendar workflow

1. Authorized user creates or updates a milestone/work item date.
2. System classifies it as date-only, scheduled datetime, or range.
3. System validates dependencies and permission rules.
4. System recalculates presentation-only schedule health indicators according to approved rules.
5. System records activity and notifies relevant stakeholders.
6. A date move affecting target opening date or gate date requires a reason and appropriate authorization.

## Milestone model

Every key milestone has:

- Name and category
- Owner
- Baseline date and current forecast date where enabled
- Status
- Gate/evidence requirement
- Dependency references
- Impact on opening date
- Activity history

## Timeline/Gantt model

Timeline/Gantt is a future view calculated from work-item dates, milestones, and dependencies. It may show dependencies and schedule changes but must not claim a validated critical path until separate design, test, and acceptance criteria exist.

## Opening-date risk

The dashboard may display an indicator based on configured conditions such as overdue critical milestones, unresolved blockers with schedule impact, incomplete required gates, or dates beyond the target opening date. It must label the logic and not imply certainty.
