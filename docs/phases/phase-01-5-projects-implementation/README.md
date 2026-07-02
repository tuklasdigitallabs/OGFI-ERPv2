# Phase 1.5 — Projects & Implementation Tracker

**Status:** Planned immediately after Phase I stabilization

## Purpose

Phase 1.5 adds an ERP-native project implementation tracker and shared Work Management Engine for managing work that is currently coordinated through spreadsheets, chat groups, verbal follow-ups, and disconnected boards.

It provides Trello-like board and task coordination while preserving ERP controls. Project tasks link to records such as Purchase Requests, Purchase Orders, Receiving Reports, Transfers, Suppliers, branches, or future Expansion Projects, but those linked records remain the source of truth.

`DEC-0007` confirms that Branch Expansion & Construction and Marketing Operations must use the shared Work Management Engine instead of creating duplicate task, comment, attachment, activity, notification, or board systems.

## Delivery decision

Phase 1.5 is scheduled after Phase I’s procurement and inventory controls are stable. It may be pulled earlier only by explicit release-priority decision; its scope must remain the controlled MVP defined here.

## Read first

- `PROJECTS_IMPLEMENTATION_PRODUCT_SPEC.md`
- `WORK_MANAGEMENT_SHARED_ENGINE_EXTENSION_SPEC.md`
- `workflows/`
- `data/PROJECTS_IMPLEMENTATION_DATA_EXTENSIONS.md`
- `data/WORK_MANAGEMENT_DATA_MODEL_EXTENSION.md`
- `specs/`
- `implementation/PHASE1_5_BUILD_BACKLOG.md`
- `quality/PROJECTS_IMPLEMENTATION_UAT_PLAN.md`
- `quality/WORK_MANAGEMENT_SHARED_ENGINE_UAT_PLAN.md`

## Scope summary

- Projects, templates, members, board/list/calendar views
- Tasks, assignees, checklists, comments, attachments, activity
- Milestones, risks, blockers, notifications, basic reports
- Permission-checked related ERP record links

## Shared Engine Extension

The shared-engine extension adds common planning rules for work containers, work items, owners, assignees, reviewers, approvers, watchers, checklists, dependencies, comments, attachments, activity history, blockers, risks, calendar events, board/list/calendar/My Work views, archive/restore behavior, and links to controlled ERP records.

The extension is documentation and planning only. It does not authorize code, schema, migration, route, UI, dependency, deployment, or production work-management behavior until the Work Management Decision Council and explicit build approval are complete.

## Non-goals

- Replace formal ERP approval or inventory workflows
- Build external contractor portals, public links, resource planning, advanced Gantt logic, task-driven financial posting, or generic chat
