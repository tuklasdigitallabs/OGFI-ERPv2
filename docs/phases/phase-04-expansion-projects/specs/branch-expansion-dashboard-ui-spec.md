# Branch Expansion Dashboard UI Specification

## Design goal

Give project sponsors and managers an immediate, trustworthy view of whether an expansion can open on time and what requires attention.

## Required header context

- Project name/code
- Brand and proposed location
- Project phase/status
- Project sponsor/project manager
- Target opening date and schedule-risk indicator
- Approved capex / committed / actual / remaining summary links where authorized
- Restricted-project marker where applicable

## Dashboard sections

1. **Schedule Health** — target opening date, overdue work, upcoming milestones, date changes, schedule-impact blockers.
2. **Phase Gates** — current gate status, evidence completeness, pending approvals/exceptions.
3. **Workstreams** — completion/health by workstream; late/blocked items.
4. **Risks & Blockers** — severity, owner, aging, schedule/budget/compliance impact.
5. **Milestones & Calendar** — next relevant events and calendar shortcut.
6. **Financial References** — authorized read-only budget/commitment/actual indicators and linked records.
7. **Readiness / Punch List** — required open items before opening/handover.
8. **Recent Activity** — auditable material changes, not generic chat.

## Interaction requirements

- Context remains visible while navigating subviews.
- Dashboard cards link to filtered lists; not decorative charts.
- A change to opening date, phase, gate, or risk must show reason/evidence entry affordance when required.
- Mobile prioritizes opening date, blockers, next milestones, My Work, and photo/evidence upload.
