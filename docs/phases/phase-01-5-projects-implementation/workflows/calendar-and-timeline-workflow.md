# Shared Calendar and Timeline Workflow

## Purpose

Define consistent date, calendar, milestone, and later timeline behavior across all work-management modules.

## Date types

| Type | Use | Storage/Display Rule |
|---|---|---|
| Date-only | Opening dates, permit expiry dates, campaign start/end days, due dates without a time | Store and display as a local calendar date; do not shift date due to timezone conversion. |
| Scheduled datetime | Inspections, meetings, deliveries, installs, launches with a time | Store as UTC; display in Asia/Manila by default. |
| Date range | Construction period, campaign run, promotion validity | Preserve inclusive/exclusive behavior explicitly in API and UI. |
| Milestone | Gate/event with a meaningful date but no duration | May be date-only or scheduled. |

## Calendar behavior

1. User opens Calendar from a shared or specialized module.
2. Server returns only authorized containers/work items/events.
3. User filters by company, brand, location, container, workstream, user, status, type, and date range as permitted.
4. Opening an event navigates to the source work item or specialized record.
5. Date changes are validated against permission, dependencies, and template rules.
6. Changes create activity events and trigger configured notifications/reminders.

## Timeline/Gantt behavior

Timeline/Gantt is a derived view over authoritative work-item dates, milestone dates, and dependencies.

Initial implementation may display sequencing and simple dependency lines only. It must not claim automated critical-path calculations, schedule optimization, or delay prediction until separately designed and tested.

## Conflict handling

- Calendar write operations require stale-update protection.
- Two users editing the same date must not silently overwrite each other.
- Date moves affecting dependent work must show impact and enforce configured permission/approval rules.
- A move that creates a circular dependency must be blocked.

## Common notifications

- Upcoming due date
- Overdue item
- Date moved
- Milestone approaching
- Blocker raised/resolved
- Required review/approval
- Assignment change

Reminder cadence and delivery channels are configurable and must avoid duplicate notification generation.
