# OGFI ERP — Design Tokens

**Document status:** Phase I baseline  
**Applies to:** Web, tablet, and mobile interfaces  
**Primary use case:** Multi-branch F&B and restaurant operations

---

## 1. Design intent

OGFI ERP must feel operational, controlled, and calm. It is not a marketing site. Users should be able to identify the branch, request, status, owner, next action, and risk level within seconds.

The interface must support:

- branch staff using tablets or phones during service;
- Head Office users reviewing many records quickly;
- approvals involving money, inventory, and supplier commitments;
- dense business information without visual clutter;
- future white-labeling without redesigning the core system.

---

## 2. Token architecture

Use semantic tokens in application code. Do not hardcode raw values inside components except within the token definition layer.

```css
:root {
  --space: 8px;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;

  --font-family-sans: "Inter", "Segoe UI", Arial, sans-serif;
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-md: 16px;
  --font-size-lg: 20px;
  --font-size-xl: 28px;
  --font-size-2xl: 36px;

  --line-height-tight: 1.2;
  --line-height-normal: 1.45;

  --shadow-sm: 0 1px 2px rgba(0,0,0,.08);
  --shadow-md: 0 4px 16px rgba(0,0,0,.10);
  --shadow-lg: 0 10px 32px rgba(0,0,0,.14);
}
```

### 2.1 Single spacing-token rule

All spacing must be based on one token:

```text
--space: 8px
```

Use only multiples of this value:

| Token | Value | Intended use |
|---|---:|---|
| `--space-0` | 0 | No gap |
| `--space-1` | 4px | Icon-to-label / micro separation |
| `--space-2` | 8px | Default internal spacing |
| `--space-3` | 16px | Standard card and form spacing |
| `--space-4` | 24px | Section spacing |
| `--space-5` | 32px | Major layout separation |
| `--space-6` | 48px | Large dashboard separation |

Never introduce arbitrary values such as 11px, 13px, 18px, 22px, or 27px. This keeps every screen visually consistent and prevents uneven layouts.

---

## 3. Color system

The default visual tone should be professional, warm-neutral, and high-legibility. Brand customization must be possible through semantic color overrides.

### 3.1 Base semantic colors

| Token | Default role |
|---|---|
| `--color-bg-canvas` | Application background |
| `--color-bg-surface` | Cards, panels, forms |
| `--color-bg-subtle` | Table headers, muted blocks |
| `--color-border-default` | Standard borders |
| `--color-border-strong` | Focused / emphasized boundaries |
| `--color-text-primary` | Main text |
| `--color-text-secondary` | Supporting text |
| `--color-text-muted` | Metadata and disabled text |
| `--color-action-primary` | Primary action |
| `--color-action-primary-hover` | Primary action hover |
| `--color-action-secondary` | Secondary action |
| `--color-status-draft` | Draft / neutral |
| `--color-status-pending` | Awaiting action |
| `--color-status-approved` | Positive / approved |
| `--color-status-rejected` | Rejected / blocked |
| `--color-status-alert` | Warning / needs attention |
| `--color-status-info` | Informational |

### 3.2 Status colors

Status must never rely on color alone. Every status uses text, icon or shape, and color.

| Status family | Typical use |
|---|---|
| Neutral | Draft, inactive, archived |
| Pending | Submitted, pending approval, in transit |
| Positive | Approved, received, completed, posted |
| Warning | Partial, overdue, variance, expiring, budget risk |
| Negative | Rejected, cancelled, failed, blocked |
| Info | In review, delegated, note required |

---

## 4. Typography

### 4.1 Hierarchy

| Element | Size | Weight | Usage |
|---|---:|---:|---|
| Page title | 28px | 700 | Main screen title |
| Section title | 20px | 700 | Major page section |
| Card title | 16px | 600 | Summary card / record panel |
| Body | 14–16px | 400 | Main data and labels |
| Metadata | 12–14px | 400–500 | IDs, dates, owner, branch |
| Table numeric value | 14px | 500–600 | Totals and amounts |

### 4.2 Numeric alignment

- Currency, quantities, and percentages are right-aligned in tables.
- Dates use the selected company format consistently.
- Currency must include the configured currency symbol.
- Large values should be readable at a glance, not compressed into small text.

---

## 5. Layout and responsive rules

### 5.1 Desktop

- Use a persistent left navigation for primary modules.
- Use a top context bar for Company, Brand, Branch/Location, and date context where relevant.
- Use content max widths that preserve readable line lengths.
- Use tables for dense operational lists.

### 5.2 Tablet

- Collapse secondary navigation into a drawer when needed.
- Keep list filters accessible without horizontal hunting.
- Preserve important action buttons above the fold.
- Optimize for portrait tablet use at branch level.

### 5.3 Mobile

- Show only essential navigation and the current workflow step.
- Replace wide tables with cards or row-detail patterns.
- Keep the primary action fixed or immediately visible.
- Avoid modals for multi-step workflows where a full screen is clearer.

---

## 6. Interactive state tokens

Every interactive component must define:

- default;
- hover;
- focus-visible;
- active;
- disabled;
- loading;
- error;
- success where applicable.

Focus indicators must be visible and meet contrast requirements. Never remove browser focus outlines without replacing them with an accessible alternative.

---

## 7. Form tokens and validation

### Field standards

- Label appears above field.
- Required fields use a clear required indicator and cannot rely only on color.
- Help text appears directly below the field when useful.
- Error message appears adjacent to the invalid field.
- Inputs must use a minimum usable tap target of 44 × 44px on touch devices.
- Numeric and currency inputs must be formatted without destroying editing behavior.

### Validation timing

- Validate essential format on blur.
- Validate business rules on submit or as soon as dependencies are available.
- Show a concise explanation and a corrective path.
- Do not clear user-entered data after a failed submission.

---

## 8. Table and list tokens

Operational list pages must use a standard structure:

1. Title and purpose
2. Context chips: Company / Brand / Branch / Period
3. Status tabs or quick filters where needed
4. Search and filter bar
5. Table or card list
6. Bulk actions only when permissions allow
7. Pagination or progressive loading

Minimum columns for business transactions:

- Record ID
- Date
- Branch / location
- Requester / owner
- Status
- Value / quantity where relevant
- Current approver or next action

---

## 9. Status chips

Status chips must be consistent across all modules.

| State | Example label |
|---|---|
| Draft | Draft |
| Submitted | Awaiting Approval |
| Approved | Approved |
| Rejected | Rejected |
| Partial | Partially Received |
| Completed | Completed |
| Cancelled | Cancelled |
| Overdue | Overdue |
| Escalated | Escalated |

No module may invent a different visual treatment for the same logical state.

---

## 10. Accessibility baseline

- Meet WCAG AA contrast for normal text and key controls.
- Do not use color as the sole indicator of status or error.
- Support keyboard navigation on desktop.
- Provide clear focus order.
- Ensure labels are programmatically associated with inputs.
- Use human-readable error messages.
- Avoid icon-only controls unless they have accessible labels and are common enough to be unambiguous.

---

## 11. White-label readiness

The following are configurable per tenant/company without altering layout behavior:

- logo;
- application name;
- primary action color;
- selected accent colors;
- favicon;
- login-page visual identity;
- document header/footer identity.

Core status colors and accessibility safeguards must remain controlled by the platform.
