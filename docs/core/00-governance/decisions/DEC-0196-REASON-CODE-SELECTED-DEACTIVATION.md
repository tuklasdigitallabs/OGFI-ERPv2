# DEC-0196 — Reason Code Selected Deactivation

## Metadata

- Status: Confirmed
- Date: 2026-07-25
- Decision Chair: Parent agent
- Related phase/module: Phase I Administration / Reason Codes

## Decision

Keep the DEC-0124 bounded registry and move deactivation into one URL-selected
TaskSheet. Active rows link to their selected detail; the selected form preserves
workflow, status, search, and page context. The service claims the expected
`ACTIVE` state with a scoped atomic update before writing the deactivation audit.

## Controls and rationale

This removes repeated per-row forms without weakening company authorization,
history retention, or auditability. A stale or concurrently handled code fails
safely as not active; no reactivation or hard delete is introduced. Authentication
recovery remains the next higher-risk administration slice.

## Evidence and remaining gates

Focused Reason Codes test, TypeScript, lint, and production build pass. Disposable
PostgreSQL authorization/concurrency/query-plan, responsive browser, hosted
recovery, and UAT evidence remain open.

