# Phase IV — Technical Build Plan

**Status:** Planned technical framework

## Technical Principle

Implement this phase as an extension of the core architecture. Do not duplicate Company, Brand, Location, User, Role, Approval, Attachment, Notification, Audit or Inventory records already defined by core standards.

## Required Technical Workstreams

1. Confirm data extensions in `data/PHASE4_DATA_EXTENSIONS.md`.
2. Define API resources and events using core API conventions.
3. Build role/scope enforcement before UI actions.
4. Implement approval, audit, notification and attachment behavior consistently.
5. Add report/query models without compromising transaction integrity.
6. Create migration and seed plan changes when master data or historic data is required.
7. Add unit, API, integration, security, concurrency and UAT tests.

## Architecture Gate

No phase-specific data model may bypass tenant, company, location/project, effective-date, audit, or soft-cancel/reversal standards where those standards apply.
