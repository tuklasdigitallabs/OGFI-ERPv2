# OGFI ERP — Mobile Rules

**Document status:** Phase I baseline  
**Primary users:** Branch Managers, Supervisors, Storekeepers, receiving personnel, requesters  
**Primary devices:** Android phones and tablets; responsive support for iOS

---

## 1. Mobile-first operational principle

Mobile is not a compressed desktop screen. On mobile, users should complete the most frequent branch actions quickly, with minimal typing and no hidden critical information.

The most important mobile workflows are:

- submit Purchase Request;
- approve or reject assigned request;
- confirm delivery receiving;
- acknowledge transfer receipt;
- submit wastage;
- conduct physical count;
- upload photo evidence;
- review urgent alerts.

---

## 2. Mobile navigation

Use a compact navigation model:

- bottom navigation for 3–5 highest-frequency areas where appropriate;
- a “More” destination for secondary modules;
- a persistent notification / action badge;
- contextual back navigation that preserves list filters;
- no deep nesting beyond three levels where avoidable.

Recommended branch mobile destinations:

1. Home
2. Tasks
3. Requests
4. Inventory
5. More

---

## 3. Screen composition

Every mobile operational screen must show, in order:

1. record title and ID;
2. branch / location;
3. current status;
4. next action and owner;
5. essential record details;
6. primary action;
7. activity history / audit trail.

Do not put the status, branch, or next action behind a tab.

---

## 4. Mobile action design

### Primary actions

- Use one clearly dominant primary action per decision point.
- Place it above the fold or in a fixed bottom action bar.
- Use action verbs: `Submit for Approval`, `Approve`, `Receive Items`, `Confirm Receipt`, `Save Count`.

### Destructive actions

- Use confirmation only when an action is irreversible or difficult to correct.
- Require a reason for cancellation, rejection, reversal, and variance-related actions.
- Avoid generic warnings such as “Are you sure?” without explaining impact.

---

## 5. Form behavior

### General

- Use progressive disclosure for long forms.
- Split multi-step workflows into logical steps with a visible step indicator.
- Save draft locally or server-side where feasible.
- Preserve values after validation errors.

### Item entry

- Support item search by name, code, category, and recent item.
- Support barcode scanning as an enhancement, not a hard dependency.
- Show item UOM and available quantity near the entry field.
- Use quick-add quantity controls only when they do not create input errors.

### Attachments

- Support camera capture directly from the workflow.
- Show upload state and retry on failure.
- Compress only when it will not remove required evidentiary detail.

---

## 6. Mobile lists and tables

Do not force horizontal scrolling for core branch tasks.

Use mobile record cards with:

- ID and status;
- branch/location;
- requester/supplier/owner;
- amount or quantity;
- date and aging;
- next action.

Use a detail drawer or full record screen for secondary fields.

---

## 7. Offline and unstable-network behavior

Phase I should be designed for imperfect connectivity even if full offline sync is introduced later.

Minimum behaviors:

- clear loading and retry states;
- protect unsaved form entries where technically feasible;
- queue uploads only when supported and communicate status clearly;
- do not present a record as submitted until the server confirms it;
- show connection issues without hiding the user’s data;
- record timestamps using the server as the source of truth after sync.

---

## 8. Tablet rules

Tablet portrait is a primary branch form factor.

- Use two-column layout only when both columns remain readable.
- Keep action controls reachable without excessive scrolling.
- Do not make the tablet interface a stretched mobile layout.
- Use split view for list + record detail when the screen width supports it.
- Ensure staff can complete receiving and stock count workflows one-handed only where practical; otherwise prioritize clear entry over compactness.

---

## 9. Performance constraints

- Avoid heavy dashboards on branch mobile home screens.
- Prioritize action queues and current-day work.
- Paginate lists.
- Load media only when opened or needed.
- Avoid blocking the entire app when a secondary widget fails.

---

## 10. Mobile acceptance checks

A mobile workflow is acceptable only when a branch user can:

- identify the branch and status without scrolling;
- complete the main action without desktop-only controls;
- upload a required photo;
- correct validation errors without losing entered information;
- recover from a poor connection;
- understand whether the action was saved, submitted, approved, or still pending.
