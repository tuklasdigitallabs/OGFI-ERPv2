# DEC-0224 — Purchase Order amendment draft recovery

## Metadata

- Decision ID: `DEC-0224`
- Title: Purchase Order amendment draft recovery after validation or stale-state errors
- Status: Confirmed
- Date: 2026-07-25
- Decision owner: Purchasing
- Decision Chair: Parent agent
- Related phase/module: Phase I — Purchase Orders

## Decision

The eligible Purchase Order amendment TaskSheet uses in-memory controlled form
state and a server action result so validation failures retain the entered reason,
notice fields, expected date, and line values for correction. Stale or receiving
conflicts retain the draft only as review context, disable resubmission, and require
an explicit reload of the current Purchase Order.

## Context

The prior server action redirected all failures to the detail page. This preserved
safe server behavior but discarded a multi-line amendment draft, forcing users to
re-enter prices, quantities, notes, and evidence context after a correctable error.

## Options considered

### Option A — selected: in-memory controlled TaskSheet state

- Benefits: preserves user work without persisting sensitive commercial values;
  server authorization, validation, CAS, approval, audit, and transaction behavior
  remain unchanged.
- Failure modes: a browser close or navigation discards the draft by design.

### Option B — rejected: URL, localStorage, or analytics persistence

- Failure modes: exposes prices/reasons/evidence outside the focused workflow and
  can preserve stale line IDs or scope after the PO changes.

### Option C — rejected: server-side draft persistence

- Failure modes: expands schema, retention, authorization, cleanup, and audit
  policy beyond this bounded recovery gap.

## Hard-gate assessment

- The existing Purchase Order amendment service remains the sole mutation authority
  and revalidates permission, tenant/company/location scope, status, line set,
  receiving state, notice evidence, CAS, approval, and audit effects on every retry.
- No inventory, receiving, supplier, approval, or audit policy changed.
- Failed submissions return no mutation; success still revalidates the page and
  approval queues.
- Stale/conflict responses cannot be resubmitted until the user explicitly reloads.
- Draft values exist only in component memory and are cleared on close/discard,
  success, reload, or terminal state.

## Required safeguards

- Show pending state and disable duplicate submission.
- Preserve validation-error values and show a safe retry message.
- Distinguish stale/receiving conflicts from correctable validation errors.
- Keep the dirty-discard confirmation and mobile-sized controls.
- Treat header edits and line-only quantity, price, or note edits as dirty so the
  discard confirmation cannot be bypassed.
- Never place amendment prices, reasons, notice references, or line values in URLs,
  local storage, logs, or analytics.

## Evidence

- Independent Architecture and Product reviews recommended the bounded slice with
  High confidence; requested Spark/GPT-5.4 models were unavailable, so the closest
  permitted GPT-5.6 fallback was used and recorded.
- Independent corrective review rejected an initially broad static assertion that
  could false-pass, then returned GO after the contract isolated `updateLine`,
  required its own dirty transition, and bound all three editable line fields to it.
- Focused Purchase Order service coverage passes 36/36; amendment visible-surface
  coverage passes 4/4; web typecheck, lint, production build, full non-database
  regression (1,340 passed, 301 skipped, one todo), and authorization manifest
  coverage pass. PostgreSQL CAS/no-mutation, responsive browser, hosted, E2E, and
  UAT gates remain open.
