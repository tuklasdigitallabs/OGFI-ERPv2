# Marketing Operations — Data Model Extension

## Design stance

Logical design only. The active repository and approved migration process govern implementation.

## Specialized entities

| Entity | Purpose | Key constraints |
|---|---|---|
| MarketingCampaign | Campaign-level planning/execution record | Company/brand scope; one accountable owner; status/approval audit. |
| Promotion | Offer/mechanics record | Brand + branch scope; date range; approval/readiness state. |
| NewItemLaunch | Marketing orchestration record for launch | Links to source R&D/costing/operations/POS records without duplicating them. |
| MarketingCreativeItem | Content/creative deliverable | Linked campaign/promotion/launch; controlled pipeline and asset references. |
| MarketingChannel | Configurable channel taxonomy | Controlled master data. |
| MarketingBranchRollout | Per-branch readiness/applicability | Branch scope, readiness/status, owner, dates. |
| MarketingCalendarEntry | Specialized calendar metadata or projection | Uses shared date/time and permission behavior. |
| MarketingApprovalRequirement | Configurable approval requirement | Must not replace formal ERP approval engine where applicable. |
| CampaignOutcome | Post-campaign review/performance notes | Metric definitions must be governed separately. |

## Common-engine references

Campaigns, promotions, launches, and creative items reference or extend shared WorkContainer/WorkItem/Assignment/Attachment/Comment/Activity/Notification entities. Do not create duplicates of common collaboration tables.

## Invariants

- Every active marketing object has company, owner, status, and audit metadata.
- Promotion branch scope must be explicit, not inferred from a generic brand label where branch-level applicability matters.
- Campaign/promotion dates use date-only or scheduled types deliberately.
- `Live` requires configured approval/readiness checks.
- Marketing records link to controlled ERP records through typed references and cannot mutate their state.
- Archived/cancelled records remain auditable and retain authorized attachments/comments/history.
