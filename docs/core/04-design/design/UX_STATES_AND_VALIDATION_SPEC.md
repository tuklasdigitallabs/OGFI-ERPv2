# OGFI ERP — UX States and Validation Specification

**Status:** Phase I UX control standard  
**Applies to:** All Phase I screens, desktop/tablet/mobile  
**Design direction:** Modern SaaS look with restaurant-grade clarity and operational safeguards.

---

## 1. Purpose

The ERP must be designed for normal, incomplete, exceptional, and failure states—not only polished happy paths. Every screen should make the user understand what happened, what information is missing, whether data is safe, and what to do next.

## 2. Global state rules

- Keep company/brand/location context visible for transaction screens.
- Use status label + icon/text; never rely on color alone.
- Do not clear a user’s entered data after a recoverable validation or network error.
- Prevent duplicate submission with idempotency and clear button state.
- Use one shared spacing token (`--space`) for all gaps, padding, and rhythm.
- Critical actions must state their consequence and require confirmation only when the action is destructive, irreversible, or high-risk.

## 3. Standard page states

| State | Required behavior |
|---|---|
| Initial loading | Skeletons that preserve layout; do not show empty state until load completes. |
| Refreshing | Keep existing data visible; show subtle refresh indicator and freshness timestamp. |
| Empty — no data exists | Explain what is missing, why it matters, and show authorized primary action. |
| Empty — filters return none | Show active filters, clear-filter action, and no-data message. |
| Permission denied | State that access is restricted; do not reveal hidden data or record details. |
| Not found | State record may be deleted/inactive/outside scope; offer return to list. |
| Server/network error | Preserve entered data where feasible; explain retry and support reference. |
| Offline / unstable connection | Warn before submit; queue only explicitly supported actions; never imply a post succeeded until confirmed. |
| Maintenance | State planned outage and available read-only/offline behavior if any. |
| Success | Use concise confirmation plus direct next action; avoid excessive toast noise. |

## 4. Form validation standards

### 4.1 Timing

- Validate required/format rules on blur and on submit.
- Validate cross-field and server rules on submit or when enough data is available.
- Do not display red errors before a user has had a reasonable chance to interact.

### 4.2 Message format

Messages should be specific and action-oriented:

- Good: `Required date must be today or later.`
- Good: `Expiry date is required because this item is expiry tracked.`
- Bad: `Invalid input.`
- Bad: `Error 400.`

### 4.3 Required validation examples

| Workflow | Validation |
|---|---|
| Purchase Request | Location, department, required date, item/description, quantity/UOM, reason where configured |
| Purchase Order | Approved supplier, delivery location, item quantities/prices/UOM, expected date, required approvals |
| Receiving | PO/reference, receiving location, accepted/rejected quantities, evidence/lot/expiry where required |
| Transfer | Source/destination, quantity/UOM, stock availability, required date, receiver constraints |
| Stock Count | Assigned location, count quantities, completion confirmation, variance reason where configured |
| Wastage | Item, source location, quantity/UOM, reason, value/cost context, evidence where required |
| Stock Adjustment | Item/location, quantity, reason, approval/evidence requirements |

## 5. Status-state presentation

| Status family | UI treatment | Examples |
|---|---|---|
| Draft / inactive | Neutral pill | Draft, Inactive, Archived |
| Submitted / pending | Info or warning pill | Pending approval, Awaiting receipt |
| Approved / active | Info/success depending on state | Approved, Issued, Dispatched |
| Completed | Success pill | Received, Completed, Closed |
| Risk / warning | Warning pill | Low stock, Partial receipt, Expiring soon |
| Critical / rejected | Danger pill | Rejected, Critical stock, Expired, Blocked |
| Cancelled / reversed | Neutral + clear label | Cancelled, Reversed, Superseded |

## 6. Action-button states

- Primary action label must name the action: `Submit for Approval`, `Receive Delivery`, `Dispatch Transfer`, `Post Wastage`.
- While submitting: disable duplicate action, show inline progress state, preserve form data.
- On success: update status and show next allowed action.
- On failure: re-enable action, preserve input, show error and safe retry path.
- Destructive actions: use a confirmation dialog that states impact, requires reason where relevant, and uses a danger-styled confirm action.

## 7. Workflow exception states

### Approval

- **Returned for revision:** show reviewer comment at top, highlight affected section if known, retain original values/history.
- **Rejected:** show reason, approver, time, and whether clone/revision is allowed.
- **Delegated:** show original approver, delegate, and effective dates.
- **Overdue:** show aging, escalation recipient, and expected next action.

### Receiving

- **Partial delivery:** show ordered, received to date, accepted today, outstanding, and PO remains open.
- **Discrepancy:** require reason/evidence as configured; alert correct owners.
- **Duplicate scan/submit risk:** block and explain existing receipt reference.

### Inventory

- **Low/critical stock:** show on-hand, par, location, and primary action `Request Stock`, not generic `Order`.
- **Negative stock prevention:** block posting unless a controlled exception policy explicitly allows it.
- **Count variance:** show system versus counted quantities; do not silently post difference.

### Offline / mobile

- If an action cannot be safely queued, disable submit with clear explanation.
- For supported queued drafts, visibly label `Saved locally — not submitted` and reconcile when online.

## 8. Accessibility and responsive requirements

- Touch targets at least 44×44px on touch workflows.
- Keyboard focus visible on desktop.
- Tables become card/list layouts on smaller screens; no horizontal compression of mandatory values.
- Required status/actions must not be hover-only.
- Use clear text hierarchy and semantic labels for icons.

## 9. Error logging and support references

User-facing errors should include a safe support reference ID where applicable. Never show stack traces, database queries, secrets, or internal authorization details.
