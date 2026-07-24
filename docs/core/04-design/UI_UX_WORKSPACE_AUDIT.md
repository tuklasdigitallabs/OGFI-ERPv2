# UI/UX Workspace Audit

Date: 2026-07-08

Scope: Full read-only audit of ERP workspaces under `apps/web/src/app/(app)` plus shared UI components under `apps/web/src/components`.

Purpose: Identify layout inefficiencies, scalability issues, and modern SaaS UX gaps before continuing broad UI refactoring.

No code was changed as part of this audit.

## Remediation Gate

This audit is an implementation gate, not background guidance.

For any workspace listed below as `Critical` or `High`, new implementation work must either remediate the finding or avoid extending the failing pattern. A milestone in that workspace must not be marked visually complete, client-presentable, or ready for UAT while the primary screen remains a long stacked-card/stacked-panel workspace, an unpaginated list, or a repeated-inline-form queue.

If a slice is intentionally backend-only, it must be labeled that way in the backlog and completion report. Backend-only slices must not be presented as finished user-facing implementation.

The expected default structure for operational workspaces is:

`compact shell -> workspace tabs -> filters/search -> paginated list -> selected record drawer/detail -> contextual action composer`

## Executive Summary

The ERP has strong operational coverage, but many workspaces currently behave like stacked documents instead of focused SaaS workspaces. The recurring issue is that pages try to show dashboard, queue, detail, transaction entry, evidence, comments, audit, and actions all at once.

The main design correction is:

`compact shell -> workspace tabs -> filters/search -> paginated list -> selected record drawer/detail -> contextual action composer`

## Cross-Cutting Findings

| Area | Severity | Finding | Recommended Pattern |
|---|---:|---|---|
| Entry surfaces | Critical | `EntryModal` is used for large transaction workspaces with wide line tables and repeated forms. | Add `RecordActionDrawer` or `TransactionSheet`; reserve modals for short single-task forms. |
| Lists and queues | Critical | Many operational lists are unpaginated or hard-capped with `slice(0, 10)`. | Shared `PaginationBar`, URL-backed filters, and list/card mobile fallback. |
| Inline actions | Critical | Many records render their own full action form inline, making long pages and repeated fields. | One selected-record action drawer/composer at a time. |
| Shell/header | High | App shell consumes too much vertical space before the working surface. | Compact SaaS header, sticky local toolbar, and route-level tabs. |
| Tabs | High | Some tabs are visual only or not URL-backed. | Shared `SegmentedWorkspaceTabs` with counts, active state, keyboard support, and query state. |
| Mobile | High | Many tables rely on `overflow-x-auto` and fixed `min-w` widths instead of labeled mobile cards. | Responsive row cards with explicit labels and primary action. |
| Preview modules | High | Marketing and Expansion preview pages are card-heavy and operationally thin. | List-first preview workspaces with filters, rows, status chips, and row actions. |
| Master data | High | Items and Suppliers are improving but still lack full server pagination/detail drawers. | Paged registry table plus detail drawer/tabbed detail. |

## Visual QA Findings

This section covers the detailed visual issues that make workspaces feel cramped, old, unreadable, or hard to operate even when the workflow logic is present.

| Area | Severity | Finding | Required Standard |
|---|---:|---|---|
| Button hierarchy | Critical | Primary, secondary, ghost, destructive, disabled, and link-style actions are inconsistently presented across pages. Some disabled buttons look like broken active buttons or become unreadable in light theme. | Use one shared button system with explicit variants, readable disabled states, and predictable action grouping. Disabled buttons must keep at least readable label contrast. |
| Button placement | Critical | Many pages show row-level actions, bulk actions, destructive actions, and workflow actions in the same visual band. This makes it hard to know the correct next step. | Keep one primary action per workspace header. Keep row actions compact. Move record-specific workflow actions into a selected-record drawer or detail page. Separate destructive actions visually and spatially. |
| Inline action forms | Critical | Several queues render repeated action inputs for every row, including reason, evidence, invoice number, completion, return, and handoff fields. | Show actions only after the user selects a record. Use one action composer with reason/evidence fields. Never repeat full forms in every row. |
| Text contrast | Critical | Light theme has low-contrast labels, chips, disabled buttons, pale text on pale cards, and low-contrast permission pills. Dark theme is better but still has weak secondary text in headers and posting context bars. | Body text, labels, pills, disabled buttons, and table headers must meet readable contrast in both themes. Avoid white text on pale blue/green surfaces and muted blue text on gray bars. |
| Theme parity | Critical | Light and dark themes do not always use equivalent semantic tokens. Some components that are readable in one theme become weak or washed out in the other. | All reusable classes must use semantic tokens for background, text, border, muted text, selected state, danger, warning, success, and disabled state. |
| Spacing scale | High | Pages mix `gap-2`, `gap-3`, `gap-4`, wide card padding, dense row padding, and large section margins without a consistent rhythm. | Use shared workspace spacing: compact controls, medium list rows, larger detail sections. Adjacent filters, tabs, and action bars should align to the same horizontal grid. |
| Text margins | High | Labels, helper text, status pills, subtitles, and field groups often sit too close or too far from related controls. Some headings and secondary text compete with each other. | Labels should sit close to their fields. Helper/error text should sit under the related field. Page subtitles should not collide with tabs, posting context, or toolbar controls. |
| Overlaps and clipping | High | Right rails and side panels can overlap the main workspace on wide but constrained screens. Some buttons and form controls clip when card width shrinks. | Use responsive grid constraints with `minmax(0, 1fr)`, avoid fixed side widths that crowd content, and test 1366px, 1440px, 1600px, tablet, and mobile widths. |
| Table density | High | Many tables use wide fixed `min-w` values and fixed column widths. This creates horizontal scrolling and hides actions or labels. | Use paginated responsive tables on desktop and labeled row cards on mobile. Use compact columns by default and move secondary detail into drawer/detail tabs. |
| Status pills | High | Status pills have inconsistent color semantics and sometimes too little contrast. Some system codes are exposed directly instead of human-readable text. | Use standardized status colors and human-readable labels. System codes may appear only in secondary metadata or audit views. |
| Form layout | High | Multiline transaction forms become cramped in modals, especially PR lines, receiving, food safety, counts, recipes, and stock adjustments. | Use transaction sheets or full-page task mode for line-heavy workflows. Keep sticky footer actions visible and use row validation summaries. |
| Modal ergonomics | High | Large centered modals hide page context, create internal scrolling, and make long line entry feel trapped. | Use modals only for short forms. Use drawers for record actions and sheets/full-page modes for transaction entry. |
| Card overuse | High | KPI cards, preview cards, and nested cards create large vertical pages where real work is below the fold. | Use compact KPI strips only when they aid decisions. Avoid cards inside cards. Prefer list-first workspaces. |
| Header height | High | Route header, context bar, badges, search, theme switcher, location switcher, and notification controls consume too much first-viewport height. | Compress shell chrome and keep workspace tabs/filter bar close to the list. First viewport must show actionable records. |
| Navigation state | High | Some detail pages lack clear return navigation or workspace breadcrumbs. Some tabs do not clearly show whether they are local tabs or navigation. | Every detail page must have a visible return/breadcrumb path. Tabs must be accessible, selected, and content-changing. |
| Empty and loading states | Medium | Empty states often explain what is missing but do not always provide the next valid action or permission reason. | Empty states should distinguish no data, filtered empty, denied, and loading. Add the next allowed action when available. |
| Mobile behavior | High | Many workspaces depend on horizontal scroll for core task completion. Actions and columns can disappear off-screen. | Mobile must use task-first row cards, sticky primary actions, and labeled fields. Horizontal scroll may be used only for non-critical analytical tables. |

## Visual QA Checklist For Every Remediated Workspace

Before a workspace is marked visually complete, verify the following:

1. Buttons have a clear hierarchy: primary, secondary, ghost, destructive, disabled.
2. Disabled buttons remain readable and do not look like broken active actions.
3. The main action is visible in the first viewport.
4. Row actions do not stretch into large full-width buttons unless the row is a mobile card.
5. Destructive actions are separated from normal workflow actions.
6. Labels, helper text, and validation messages are visually tied to the correct fields.
7. Text does not overlap, clip, or disappear at 1366px desktop, tablet, and mobile widths.
8. Long words, system IDs, document numbers, and permission names wrap or truncate safely with tooltips/detail access.
9. Light and dark themes both pass readable contrast for body text, muted text, chips, tabs, buttons, status pills, table headers, and posting context.
10. Tables with more than 10 records have pagination.
11. Mobile views do not require horizontal scroll for normal task completion.
12. Modals are used only for short single-purpose entry.
13. Long transaction entry uses a drawer, sheet, stepper, or full-page task mode with sticky submit/cancel controls.
14. Cards are not nested inside cards.
15. First viewport shows useful work, not only metrics or decorative cards.
16. Detail pages have clear breadcrumb/back navigation.
17. Tabs are real interactive controls with visible selected state.
18. Empty, filtered-empty, denied, loading, and error states are distinct.
19. Audit, evidence, and comments are reachable without bloating every row.
20. A user can identify the current status and next action within five seconds.

## Visual QA Hotspots Found In Code

| Hotspot | Evidence | Risk | Remediation |
|---|---|---|---|
| Wide line-entry tables | `FoodSafetyReadingsEditor.tsx`, `StockCountEntriesEditor.tsx`, recipe, count, receiving, and adjustment flows use fixed `min-w` tables. | Cramped forms, horizontal scroll, hidden actions, poor mobile entry. | Replace with shared `LineEntryGrid` with desktop compact mode and mobile row cards. |
| Large centered transaction modals | `EntryModal.tsx` is used by transaction-heavy pages. | Users lose context and must scroll inside a modal to complete work. | Keep `EntryModal` for short forms only; introduce `TransactionSheet`. |
| Repeated inline action buttons/forms | Admin break-glass, finance actions, expense requests, approvals, and inventory detail pages show several actions at once. | Action confusion and high chance of wrong workflow action. | One selected-record `RecordActionDrawer` with mutually exclusive workflow action. |
| Fixed-width operational layouts | Many pages use `min-w-[980px]`, `min-w-[1080px]`, `min-w-[1180px]`, or fixed side rails. | Overlap and clipping on common laptop widths. | Use responsive list/detail layouts and mobile cards. |
| Low-contrast chips and buttons | Theme screenshots and existing pale chip/button classes show weak readability in light and dark themes. | Users cannot read important state or available actions. | Centralize chip/button/status token classes and test both themes. |
| Card-heavy previews | `ModulePreviewPage.tsx` uses many card grids. | Preview modules feel decorative and do not scale to real operations. | Convert previews to list-first operational mockups. |

## Shared Components To Build

1. `PaginationBar`
   - URL-backed page and page size.
   - Shows `Showing X-Y of Z`.
   - Mobile-friendly previous/next controls.

2. `SegmentedWorkspaceTabs`
   - Real links or buttons, not decorative spans.
   - Counts, active state, keyboard support.
   - Query-param preservation.

3. `RecordActionDrawer`
   - Opens from one selected record.
   - Shows record summary, action-specific fields, audit note, evidence area, and submit controls.
   - Replaces repeated inline forms.

4. `TransactionSheet`
   - For medium/large transaction entry: receiving, counts, stock adjustments, recipes, branch checklists, food safety readings.
   - Supports sticky footer actions and mobile stepper/card mode.

5. `LineEntryGrid`
   - Shared multiline editor shell for PR, receiving, transfer, count, wastage, adjustment, quote, recipe, branch checklist, and food safety line entry.
   - Configurable columns, row validation, sticky header/footer, mobile row cards.

6. `IndexPageLayout`
   - Summary strip, tabs, filters, result count, paginated list, empty/filtered-empty states.

7. `ResponsiveBoardListToggle`
   - Board on desktop, list on tablet/mobile.
   - Needed for Work Boards and future board/calendar views.

## Highest Priority Remediation Order

| Priority | Workspace | Severity | Why First |
|---:|---|---:|---|
| 1 | Approvals | High | Normalized routing has real URL-backed tabs and one decision composer, but the feature-disabled compatibility path still loads an unbounded legacy queue and client-slices it. |
| 2 | Receiving | High | Queue links to a dedicated `/receiving/new` full-page draft task with a responsive line editor and persistent draft action. |
| 3 | Workforce | Critical | One route contains too many unrelated operational jobs. |
| 4 | FinanceSubworkspace / AP | Critical | Monolithic shared component stacks AP, GL, bank/cash queues and repeated action forms. |
| 5 | Expense Requests | Critical | Same records appear across stacked sections with inline evidence/actions. |
| 6 | Core pagination | High | PR, PO, inventory, counts, approvals, receiving need consistent paging. |
| 7 | Quotes | Medium | Master-detail comparison, commercial fields, and optional controlled quotation evidence are implemented; mandatory evidence policy and environment-owned gates remain open. |
| 8 | Items and Suppliers | High | Master data needs server-backed list/detail patterns. |
| 9 | Projects / My Work / Work Boards | High | Cards and boards are too expanded for real task volume. |
| 10 | Restaurant Ops entry flows | High | Branch ops, food safety, recipes rely on wide modal line grids. |

## Route-Level Audit Matrix

### Shared Shell And Components

| Route/Component | Severity | Current Pattern | Problem | Recommended Pattern |
|---|---:|---|---|---|
| `AppShell.tsx` | High | Large route header plus posting context plus top controls. | First actionable content can be pushed below the fold. | Compact header with title, route tabs, and local toolbar. |
| `ShellNavigation.tsx` | High | Desktop nav is rich; mobile nav is less complete/contextual. | Mobile wayfinding and active state can be weak. | Responsive nav with active state, overflow, and route-local secondary nav. |
| `EntryModal.tsx` | Critical | One generic large centered modal. | Used for long forms and transaction workspaces. | Keep for short forms; add drawer/sheet/stepper for long tasks. |
| `ModulePreviewPage.tsx` | High | Preview card mosaics. | Future modules look decorative, not operational. | List-first preview shell with rows, filters, and realistic actions. |

### Overview And Insights

| Route | Severity | Current Pattern | Problem | Recommended Pattern |
|---|---:|---|---|---|
| `/dashboard` | Medium | Hero, tabs, metric cards, card grids. | Too summary-first; actionable queues are not dominant. | Start with `Today's work` queue, then compact KPI strip, analytics/reports secondary. |
| `/reports` | Medium | Report card library with tabs. | Harder to scan than a directory; no favorites/recent search. | Report directory table/list with group chips, favorites, and inline export. |
| `/notifications` | High | Scan utility panels before inbox. | Inbox is pushed below admin-like controls; no pagination/date filter. | Inbox-first with grouped tabs, sticky filters, batch actions; move scan tools to secondary menu. |
| `/knowledge-base` | Medium | Left article list and reader. | Good base, but missing search, TOC, recent/helpful shortcuts. | Searchable help center, article TOC, contextual workspace links. |

### Procurement And Purchasing

| Route | Severity | Current Pattern | Problem | Recommended Pattern |
|---|---:|---|---|---|
| `/purchase-requests` | High | KPI/filter/list plus create modal. | No pagination; PR creation uses wide line-entry modal. | Queue-first list with status tabs, pagination, and create drawer/wizard. |
| `/purchase-requests/[id]` | High | Two-column detail with stacked right rail. | Lines, quotes, comments, approvals, audit compete in one scroll. | Detail tabs: `Lines`, `Quotes`, `Comments`, `Approvals`, `Audit`; sticky action rail. |
| `/quotes` | High | Approved PR cards with nested quote/line content. | Severe vertical sprawl and weak comparison flow. | Master-detail quote comparison workspace with PR queue and sticky recommendation composer. |
| `/purchase-orders` | High | Filterable list and draft PO modal. | No pagination; draft action detached from recommendation context. | Paged PO list with saved filters and row-level draft/issue actions. |
| `/purchase-orders/[id]` | High | Long detail page with many modals. | Receipts, amendments, closure, audit, lines all stack. | Detail tabs: `Summary`, `Lines`, `Receipts`, `Amendments`, `Audit`; contextual action rail/menu. |
| `/purchase-orders/[id]/print` | Low | Print view. | Purpose-specific; not a normal workspace. | Keep separate print-optimized layout. |

### Approvals

| Route | Severity | Current Pattern | Problem | Recommended Pattern |
|---|---:|---|---|---|
| `/approvals` | Critical | Inbox with visual tabs. | Tabs look clickable but are not real segmented views; no pagination/search. | URL-backed tabs: `Assigned`, `Due Soon`, `Returned`, `History`; paginated queue. |
| `/approvals/[id]` | Critical | Separate approve/return/reject forms. | Competing forms increase decision error risk. | One decision composer with mutually exclusive action choice, remarks, and submit. |

### Inventory And Warehouse

| Route | Severity | Current Pattern | Problem | Recommended Pattern |
|---|---:|---|---|---|
| `/inventory` | Medium | Stock balance table with search. | No pagination; mobile labels are weak; few operational filters. | Paged table with filters: category, storage, expiring, positive stock; mobile cards. |
| `/inventory/ledger` | High | Latest 100 movement list. | Hard cap hides full history; no date/source filters. | Paged ledger timeline/table with date range, item, source, movement filters. |
| `/transfers` | High | Flat transfer list and request modal. | No role/status segmentation or pagination. | Segmented queues: `Requested`, `Dispatch`, `Receive`, `Disputed`, `Done`. |
| `/transfers/[id]` | High | Detail with status notices and receive/settle modals. | Receive/discrepancy work is too modal-heavy. | Transfer detail tabs plus receive/discrepancy drawer. |
| `/counts` | High | Count list and schedule modal. | No list pagination; count entry happens in modal. | Count session queue plus full-page count-entry mode. |
| `/counts/[id]` | High | Detail with count-entry modal and variance sections. | Review and variance flow split across long scroll. | Tabs: `Snapshot`, `Entries`, `Variance`, `Adjustment Link`. |
| `/wastage` | High | List plus create modal. | No status filters/pagination; dense spreadsheet modal. | Status queue plus drawer entry with evidence previews. |
| `/wastage/[id]` | High | Detail with review/post/reverse controls. | Actions live away from line evidence context. | Detail tabs and line-anchored review/post drawer. |
| `/adjustments` | High | List plus create modal. | Same density issues; opening balance nuance buried. | Adjustment-type tabs/filters plus contextual policy banner and drawer entry. |
| `/adjustments/[id]` | High | Detail with line table and action modals. | Post/reverse/review actions not local to line review. | Detail tabs with selected action drawer. |

### Master Data

| Route | Severity | Current Pattern | Problem | Recommended Pattern |
|---|---:|---|---|---|
| `/suppliers` | High | Supplier register plus catalog section. | No supplier pagination/filtering; row modals; catalog adds scroll weight. | Supplier registry table plus selected supplier tabs: `Overview`, `Catalog`, `Accreditation`, `Audit`. |
| `/items` | High | Tabbed master data with accordions and client DOM filtering. | No server pagination; accordions and modals become stacked-card heavy. | Per-tab paged tables with server search/filter/sort and detail drawer/editor. |

### Finance

| Route | Severity | Current Pattern | Problem | Recommended Pattern |
|---|---:|---|---|---|
| `/finance` | Medium | KPI strip, setup cards, source-chain table, right rail. | Route navigation is buried; source chain not paged/filterable. | Finance tabs and one primary actionable queue; setup/guardrails secondary. |
| `/finance/general-ledger` | High | Shared subworkspace with creation modal and inline row forms. | Heavy modal-first flow and repeated action forms. | Ledger tabs: `Queue`, `Posted`, `Reversals`, `Reports`; row drawer. |
| `/finance/accounts-payable` | Critical | AP invoice, matching, readiness, reports, releases stacked. | Too many conceptual workspaces on one page; slice caps instead of pagination. | Tabs: `Invoices`, `Match Queue`, `Payment Requests`, `Release Register`, `Aging`. |
| `/finance/bank-cash` | High | Deposits, statements, reconciliation cards and tables mixed. | Matching actions buried; no dedicated reconciliation workspace. | Tabs: `Deposits`, `Statement Lines`, `Reconciliations`, `Exceptions`; two-pane workbench. |
| `/finance/budget-control` | High | Creation modals, KPI strip, action queues, table, right rail. | Repeated action forms and width squeeze. | Tabs: `Budgets`, `Revisions`, `Lines`, `Commitments`; drawer actions. |
| `/finance/expense-requests` | Critical | Reports, AP handoff, action queue, request table stacked. | Same records repeated; evidence/actions inline in rows. | Primary request list plus detail drawer tabs: `Overview`, `Evidence`, `AP Handoff`, `Activity`. |
| `/finance/cash-advances` | High | Exceptions, reports, advance actions, liquidation actions, queue. | Duplicate record management across stacked sections; no pagination. | Tabs: `Advances`, `Liquidations`, `Exceptions`, `Reports`; contextual drawer actions. |
| `/finance/petty-cash` | High | Exceptions, reports, request queue, liquidation queue, funds table. | Five major sections in one route; repeated side-form pattern. | Tabs: `Funds`, `Requests`, `Liquidations`, `Exceptions`; selected record drawer. |
| `/finance/period-close` | Medium | KPI strip, close runs, checklist/exceptions split columns. | Operationally valid but still inline-form heavy. | Master-detail run layout with tabs: `Checklist`, `Exceptions`, `Evidence`, `History`. |
| `FinanceSubworkspace.tsx` | Critical | Monolithic shared component branches by finance kind. | Too broad; encourages stacked workflows and inline forms. | Split shell from route-specific modules; keep shared shell only. |

### Workforce

| Route | Severity | Current Pattern | Problem | Recommended Pattern |
|---|---:|---|---|---|
| `/workforce` | Critical | One giant all-in-one workspace. | People, assignments, leave, overtime, schedules, attendance, readiness, evidence, reports all compete. | Split into tabs/subroutes: `Overview`, `People`, `Assignments`, `Requests`, `Schedules`, `Attendance`, `Readiness`. |

### Work Management

| Route | Severity | Current Pattern | Problem | Recommended Pattern |
|---|---:|---|---|---|
| `/projects` | High | Summary cards, create modals, health cards, members, risks, activity, registry. | Portfolio screen overloaded; no registry pagination; actions detached from rows. | List-first project registry with tabs: `All`, `At Risk`, `Restricted`, `Archived`; detail drawer. |
| `/project-templates` | Medium | KPI cards, create modal, registry list. | No search/filter/pagination or edit/detail flow. | Template registry table with status filter and detail drawer/page. |
| `/my-work` | High | Giant task cards with checklist/comments/attachments/links/actions. | Queue is not scannable; repeated inline forms. | Compact task list/cards with one primary action; details in drawer/page. |
| `/my-work/[taskId]` | Medium | Detail page with stacked sections and modals. | Good base, but long and modal-heavy. | Tabs: `Overview`, `Checklist`, `Activity`, `Links`; sticky actions. |
| `/work-boards` | High | Fixed-width Kanban board. | Mandatory horizontal scroll; no list fallback. | `Board` / `List` toggle; lane-filtered list for mobile/tablet. |
| `/work-calendar` | High | Dated list with sidebar. | Called calendar but not calendar-like; no agenda/month split. | `Agenda` / `Month` tabs, sticky date bar, event drawer. |

### Restaurant Operations And Food Cost

| Route | Severity | Current Pattern | Problem | Recommended Pattern |
|---|---:|---|---|---|
| `/branch-operations` | High | KPI strip, filter bar, fixed-width queue. | Horizontal scroll and only basic pagination. | Exception-first queue with mobile cards and status chips. |
| `/branch-operations/[id]` | High | Detail with metric cards and checklist lines. | Spreadsheet modal for create/correct; detail needs tabs. | Tabs: `Lines`, `Exceptions`, `History`; drawer/stepper entry. |
| `/food-safety` | High | KPI strip, wide log table, entry modal. | 1180px reading-entry table; weak mobile flow. | Daily log queue with `Critical`, `Needs Review`, `Returned` tabs; station-by-station drawer. |
| `/food-safety/[id]` | High | Detail page with readings and review actions. | Correction/review modals repeat wide line-entry pattern. | Exception-only toggle, sticky close/review actions, reading tabs. |
| `/incidents` | Medium | KPI strip, wide incident queue, create modal. | Fixed-width queue; raw source IDs. | Incident inbox with compact rows and source-link picker drawer. |
| `/incidents/[id]` | Medium | Summary plus right rail. | Needs evidence/activity/source tabs. | Tabs: `Summary`, `Evidence`, `Linked Record`, `Activity`. |
| `/maintenance` | Medium | KPI strip, wide ticket queue, create modal. | SLA risk not primary; fixed-width table. | SLA-first queue with tabs: `Overdue`, `Critical`, `Vendor Pending`. |
| `/maintenance/[id]` | Medium | Summary/history/sidebar detail. | Next action and SLA state not promoted enough. | Promote SLA and next action near title; tabs for history/evidence. |
| `/recipes` | High | Multi-view workspace, recipe modal, library and cost views. | Recipe creation too dense for modal; food-cost fixed-width. | List-first library; create recipe wizard/drawer; paginated food-cost list. |
| `/recipes/[id]` | High | Long detail combining workflow, pricing, lines, revision operations. | Too many jobs on one page. | Detail tabs: `Overview`, `Lines`, `Workflow`, `Pricing`, `History`. |
| `/recipes/analysis` | High | Separate drilldown with multiple filter zones. | No pagination; analytical lists hard to scan. | One split workspace with sticky filters and paginated panels. |

### Admin

| Route | Severity | Current Pattern | Problem | Recommended Pattern |
|---|---:|---|---|---|
| `/admin` | High | Workspace cards plus giant tabbed page. | Heavy; major lists lack search/pagination; creates sit above registries. | List-first tabs with filters, pagination, and detail drawer routing. |
| `/admin/users/[id]` | High | Many stacked role/scope/request/audit panels. | Too much on one page; modal actions everywhere. | Tabs: `Overview`, `Roles`, `Scopes`, `Requests`, `Audit`. |
| `/admin/roles/[id]` | Medium | Permission matrix plus side panel. | Good base, but search/filter/diff is weak for large roles. | Searchable permission matrix with `Sensitive`, `Overrides`, `Recommended Drift` filters. |
| `/admin/settings` | High | Category chips and policy table with modal per row. | Dense register; modal hides table context. | Searchable settings register with side drawer showing current/default/history. |
| `/admin/readiness` | High | Giant evidence/gate workspace. | Too much narrative and evidence entry on one route. | Gate table first; evidence drawers per gate; separate GO/NO-GO workspace. |
| `/admin/reason-codes` | Medium | Strong list-first base. | Needs pagination and row drawer for edit/deactivate/history. | Keep pattern, add pagination and detail drawer. |
| `/admin/break-glass` | Medium | Alert hero and register rows with modals. | No status/user/location filters; modal churn. | Queue tabs `Pending`, `Active`, `Closed` and right drawer review. |
| `/admin/mfa` | Medium | Summary plus register rows. | Missing filters/search/history drilldown. | `Missing`, `Pending`, `Verified`, `Revoked` filters and detail drawer. |
| `/admin/session-invalidation` | Medium | Info banner and queue list. | No filters/pagination; modal per completion. | Compact queue with status/source filters and completion drawer. |
| `/admin/audit/[id]` | Medium | Metadata cards and raw JSON panels. | No semantic diff. | Event summary, before/after diff viewer, raw JSON toggle. |
| `/admin/companies/[id]` | Low | Read-only identity/activity cards. | Card stacking acceptable but mixed activity. | Tabs: `Identity`, `Access`, `Activity`. |
| `/admin/locations/[id]` | Low | Read-only identity/activity cards. | Same as company detail. | Tabs: `Identity`, `Access`, `Activity`. |
| `/admin/permissions/[id]` | Medium | Permission definition with nested roles/users. | Nested card stack can grow. | Separate lists: `Granting Roles`, `Effective Users`. |
| `/admin/approval-rules/[id]` | Low | Read-only cards. | Comparison requires backtracking. | Keep detail; add next/prev or drawer from registry. |

### Marketing And Expansion Preview Pages

| Route | Severity | Current Pattern | Problem | Recommended Pattern |
|---|---:|---|---|---|
| `/marketing/*` | High | Shared preview card mosaics. | Card-heavy, not workflow-real; no pagination/row actions. | Campaign/activation list with filters, status tabs, optional calendar/board views. |
| `/expansion/*` | Medium | Stage-gated site, permits, construction, readiness, punch-list, and post-opening queues use scoped services, pagination, focused entry sheets, and mobile record cards. The dashboard separates Portfolio, Reports, and Activity. Playbook task and milestone editing uses sheets; short checklist, evidence, and signoff configuration uses focused modals and all builder lists have mobile cards. | Browser-size visual QA is still required across representative stage queues and the playbook builder before client UAT. | Preserve the stage-gated workspace model; validate responsive layout, action hierarchy, and readable theme contrast at desktop, tablet, and mobile widths. |

## Implementation Roadmap

### Pass 1: Shared UI Foundation

1. Build `PaginationBar`.
2. Build `SegmentedWorkspaceTabs`.
3. Build `RecordActionDrawer`.
4. Build `TransactionSheet`.
5. Build `LineEntryGrid`.
6. Update `EntryModal` usage rules in code comments/design docs.

### Pass 2: Critical Workflow Fixes

1. `/approvals` and `/approvals/[id]`
2. `/receiving`
3. `/workforce`
4. `FinanceSubworkspace` and `/finance/accounts-payable`
5. `/finance/expense-requests`

### Pass 3: Operational Queue Standardization

1. `/purchase-requests`
2. `/purchase-orders`
3. `/inventory`
4. `/inventory/ledger`
5. `/counts`
6. `/transfers`
7. `/wastage`
8. `/adjustments`

### Pass 4: Master Data And Work Management

1. `/items`
2. `/suppliers`
3. `/projects`
4. `/my-work`
5. `/work-boards`
6. `/work-calendar`

### Pass 5: Restaurant Ops And Preview Modules

1. `/recipes`
2. `/recipes/[id]`
3. `/food-safety`
4. `/branch-operations`
5. `/maintenance`
6. `/incidents`
7. `/marketing/*`
8. `/expansion/*`

## Definition Of Done For UX Remediation

A remediated workspace is done when:

1. The first viewport shows the primary work surface, not a wall of cards.
2. Growing lists are paginated and filter state is URL-backed.
3. Mobile has labeled cards or compact rows, not mandatory horizontal scroll.
4. Only one selected-record action composer is visible at a time.
5. Long transaction entry uses drawer/sheet/stepper, not a giant modal.
6. Tabs are real, accessible, and change content.
7. Empty state and filtered-empty state are distinct.
8. Destructive and approval actions are visually separated and context-bound.
9. Audit/evidence/history are reachable without bloating every row.
10. The user can identify the next action within five seconds.
