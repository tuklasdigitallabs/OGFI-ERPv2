# OGFI ERP — Modern SaaS UI Reference Notes

## Approved Direction

The OGFI ERP must use a **Modern SaaS visual style** while retaining restaurant-grade operational controls.

## Reference Is Used For

- Polished sidebar and top-bar shell
- Restrained blue accent color
- White cards on a light neutral background
- Balanced tables with clear status pills
- Search, filters, summary KPI cards, and dashboard composition
- Responsive tablet and mobile behavior

## Reference Is Not Used For

- Skipping approved purchasing and warehouse controls
- Showing future-phase modules before they are released
- Hiding branch, warehouse, project, department, requester, or status context
- Letting low stock create a supplier Purchase Order directly

## Non-Negotiable Operational UI Rules

1. Show company, brand and transaction location context on every meaningful screen.
2. Show status, owner, next action, current approver, and audit evidence on controlled records.
3. Route low-stock replenishment through warehouse availability before external purchasing.
4. Use role-specific dashboards rather than one generic executive dashboard.
5. Use responsive cards on small screens rather than horizontally squeezed tables.
6. Preserve mobile-first workflows for receiving, transfers, stock counts, wastage, approvals and photo attachments.

## Visual Hierarchy

- Primary blue: active state, primary action, informational emphasis
- Green: approved, completed, in stock, successful
- Amber/orange: warning, low stock, pending risk
- Red: critical, rejected, expired, destructive action
- Grey: draft, neutral, inactive, archived


## Projects & Implementation Tracker application

Use the Modern SaaS reference style for project dashboard cards, board columns, task detail panels, status badges, filters, and responsive mobile task lists. Maintain operational density and clear action labels; do not turn the tracker into a decorative consumer-style board. Project context, due-date state, blocked reason, owner, and activity must remain visible.
