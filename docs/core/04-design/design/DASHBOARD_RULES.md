# OGFI ERP — Dashboard Rules

**Document status:** Phase I baseline  
**Applies to:** Executive, Head Office, warehouse, purchasing, and branch dashboards

---

## 1. Dashboard purpose

Dashboards must help users decide what to do next. They are not decorative scoreboards.

Every dashboard must answer four questions immediately:

1. What requires action now?
2. What is delayed, risky, or outside normal limits?
3. What changed compared with the relevant prior period?
4. Who owns the next action?

---

## 2. Common dashboard structure

Every dashboard uses this order:

1. **Context bar** — Company, Brand, Branch/Location, date range, data freshness.
2. **Action queue** — approvals, overdue tasks, discrepancies, blocked records.
3. **Critical KPI strip** — 3–6 core values appropriate to the role.
4. **Operational detail** — trend, list, variance, or status visualization.
5. **Drill-down lists** — records that explain a metric.

Do not lead with charts when the user has unresolved actions.

---

## 3. Context and filtering rules

Every dashboard must show the scope of the numbers being displayed.

Required context fields:

- Company
- Brand, where applicable
- Branch / location, warehouse, or project
- Period
- Last refreshed timestamp

Rules:

- Branch users must default to their assigned branch.
- Head Office users may switch to All Branches only if their access allows it.
- Filters must persist while drilling into a record and returning to the dashboard.
- User scope must constrain available filters; users cannot filter into unauthorized data.

---

## 4. Action-first rules

The top of a dashboard must surface high-priority records rather than merely totals.

### High-priority examples

- Pending approvals beyond SLA
- Emergency purchase awaiting post-approval
- PO overdue against required delivery date
- Receiving discrepancy awaiting resolution
- Transfer pending acknowledgment
- Negative inventory or blocked stock movement
- High-value wastage pending approval
- Physical count variance pending investigation
- Stock items below reorder threshold, where enabled

Each action item must show:

- record ID;
- branch/location;
- severity;
- age / overdue duration;
- owner;
- direct action or open-record link.

---

## 5. KPI rules

### 5.1 KPI cards

Each KPI card must show:

- primary value;
- clear label;
- applicable scope;
- comparison or trend only when meaningful;
- drill-down target;
- data freshness when not real-time.

Never display a KPI with no explanation of its scope or period.

### 5.2 Phase I KPI baseline

#### Executive / General Manager

- Total pending approvals
- Overdue approvals
- Open PO value
- Receiving discrepancies
- Inventory variance value
- Wastage value

#### Purchasing

- PRs awaiting action
- POs awaiting approval
- POs overdue for delivery
- Supplier quotation comparisons pending
- Supplier price changes flagged
- Incomplete deliveries

#### Warehouse / Inventory

- Transfers awaiting dispatch
- Transfers awaiting receipt confirmation
- Pending physical counts
- Unresolved count variances
- Wastage pending approval
- Negative or below-zero stock exceptions

#### Branch Manager

- Pending branch approvals
- Deliveries due today
- Transfers due / pending receipt
- Wastage submitted today
- Pending count tasks
- Open stock discrepancies

---

## 6. Chart rules

Charts are optional and should be used only when they reveal a trend or comparison faster than a table.

Allowed Phase I chart purposes:

- Approval aging by department or branch
- Open PO value by supplier or branch
- Wastage value by category over time
- Inventory variance by location
- Delivery performance trend

Chart requirements:

- title states metric, scope, and period;
- direct link to supporting record list;
- no rainbow palettes;
- labels and tooltips must be readable;
- empty or insufficient data has an explanatory state;
- charts never replace the detailed record list.

---

## 7. Alert severity

| Severity | Meaning | Default display behavior |
|---|---|---|
| Critical | Immediate operational or financial risk | Top queue, persistent until resolved |
| High | Requires timely review | Prominent action queue item |
| Medium | Requires attention but not immediate escalation | Dashboard list and notification |
| Low | Informational or routine follow-up | Feed, badge, or digest |

Severity should be calculated from configurable rules, not manual color choice.

---

## 8. Drill-down and traceability

No dashboard total is allowed without a path to the underlying data.

Examples:

- Clicking “Open PO Value” opens a filtered PO list.
- Clicking “Wastage Value” opens submitted and approved wastage entries for the period.
- Clicking “Overdue Approvals” opens the exact approval queue.

Drill-down pages must preserve the dashboard filter context.

---

## 9. Empty, error, and loading states

### Empty state

Use when there is genuinely no data in the selected scope. Explain whether this is expected and show the next appropriate action.

### Error state

State what failed, what data may be stale, and offer retry. Do not replace the whole page with a vague error when other data is available.

### Loading state

Use skeletons for cards, lists, and table rows. Preserve the page layout so users understand what will appear.

---

## 10. Dashboard performance rules

- Load the actionable summary first.
- Defer expensive secondary analytics where necessary.
- Avoid loading all transaction history into the browser.
- Refresh live action queues intelligently, without disrupting a user’s current action.
- Show last updated time for data that may lag.
