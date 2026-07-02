# Marketing Operations — Product Specification

## Purpose

Provide a dedicated operating workspace for marketing planning and execution: calendars, campaigns, promotions, new-item launches, creative production, branch rollouts, asset readiness, approvals, and post-campaign review.

Marketing uses the shared Work Management Engine but owns marketing-specific records and pipeline rules.

## Scope

### In scope

- Marketing calendar
- Campaigns
- Promotions
- New-item launches
- Creative/content production workflow
- Branch rollout tracking
- Campaign/project boards and task assignments
- Asset references and approval status
- Marketing work intake/briefs
- Campaign/promotion/new-item status, approvals, dates, branch applicability, and post-review

### Out of scope for first release

- Paid media buying integrations
- Full social publishing platform
- POS promotion configuration automation
- Financial release/payment behavior
- Public asset sharing
- Advanced attribution analytics
- Automatic generation/publishing of creative content

## Main objects

### Campaign

Fields include: name/code, brand, applicable branches, objective, target audience, owner, assigned users, dates, status, approval state, related promotion/new item, channel, assets, rollout readiness, and performance notes.

### Promotion

Fields include: name/code, brand, participating branches, start/end dates, mechanics, offer type, terms, required approvals, POS/setup requirement indicator, creative assets, communication status, and review state.

### New-item launch

Lifecycle links concept/R&D/food cost/pricing/operations/packaging/supplier/creative/POS/training/launch/review tasks without taking ownership of those source processes.

### Creative/content item

Fields include brief, channel, linked campaign/promotion/new item, owner, assignees, due date, state, review/approval, asset reference, branch/date scope.

## Default pipelines

### Campaign / promotion / launch

1. Idea Intake
2. Briefing
3. Planning
4. For Approval
5. In Production
6. Ready for Launch
7. Scheduled
8. Live
9. Monitoring
10. Post-Campaign Review
11. Completed / Cancelled

### Creative work

1. Brief Received
2. Concepting
3. For Review
4. Revision Required
5. Approved
6. For Production
7. Released
8. Archived

Status sets are controlled templates, not ungoverned user-specific boards.

## Calendar views

- Campaign calendar
- Promotion calendar
- Content/creative calendar
- New-item launch calendar
- Branch opening calendar
- Mall event calendar
- Holiday/seasonal calendar

Filters include brand, branch, campaign, promotion type, assigned user, status, date range, and channel.

## Controls

- Each campaign/promotion/new-item launch has one accountable owner.
- A promotion cannot be marked Live until configured approvals, date range, branch scope, and required readiness items are satisfied.
- Marketing tasks may link to expansion, procurement, new-item, POS, finance, or operational records but cannot change them directly.
- Asset access respects campaign/project permissions and retention rules.
- New-item launch readiness must display dependencies rather than claiming R&D, finance, POS, or operations steps are complete without authorized source evidence.
