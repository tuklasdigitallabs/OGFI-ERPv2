# DEC-0196 — Reason Code Selected Deactivation

## Metadata

- Status: Confirmed
- Date: 2026-07-25
- Decision Chair: Parent agent
- Related phase/module: Phase I Administration / Reason Codes

## Decision

Keep the DEC-0124 bounded registry and use one selected-record interaction.
Administrators select or deselect the whole row/card, then use one contextual
action to open a URL-owned centered modal. That modal contains the scoped detail,
the audited edit form, and—only for an active code—the reason-required
deactivation form. It preserves workflow, status, search, and page context. The
service claims the expected `ACTIVE` state with a scoped atomic update before
writing the deactivation audit.

## Controls and rationale

This removes repeated row actions, the competing inline detail, and the
automatically opened deactivation drawer without weakening company authorization,
history retention, or auditability. A stale or concurrently handled code fails
safely as not active; no reactivation or hard delete is introduced. This
presentation amendment was confirmed by the product owner on 2026-08-10.

## Evidence and remaining gates

Focused Reason Codes contract test, changed-file lint, web TypeScript, and the
optimized production image build pass for the centered selected-record modal
amendment. The local web container was recreated from that image and returned a
healthy application/database response. Responsive browser, disposable PostgreSQL
authorization/concurrency/query-plan, hosted recovery, and UAT evidence remain open.
