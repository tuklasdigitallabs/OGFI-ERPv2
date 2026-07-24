# DEC-0123 — Bounded Synchronous Administration Audit Export

## Metadata

- Decision ID: `DEC-0123`
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Core Administration / Reporting
- Decision Chair: Parent agent
- Related phase/module: Phase I — Administration Audit Trail

## Decision

Admin Audit CSV remains synchronous for the current release, but requires a strict valid UTC From/To range and enforces configurable maximum date-span and row limits. Oversized requests fail with a stable 413 response and no partial file. Background delivery with private artifacts and expiring downloads is deferred until the worker/storage architecture is approved.

## Context and options

The prior route recursively fetched every matching audit page, with optional dates and repeated count queries. A privileged administrator could trigger unbounded database and Node.js work. A BullMQ worker currently has no export processor, artifact persistence, retention, or download authorization, so async delivery would fail current architecture and recovery gates.

The selected bounded synchronous option is reversible, preserves current permission/filter parity, and prevents silent truncation. Defaults are 10,000 rows and 31 inclusive UTC calendar days, with safety ceilings of 100,000 rows and 366 days. The query uses a pre-start watermark so its own lifecycle event is excluded.

## Hard gates and safeguards

- Existing tenant, selected-company, tenant-role, and Core Admin authorization remain server-enforced.
- Invalid, reversed, missing, or over-window dates return stable 400 errors; over-row requests return 413 with no CSV bytes.
- Exact filter predicates, deterministic ordering, redacted projection, and export audit start/fail/complete events remain aligned.
- The first page performs the count; subsequent cursor pages do not repeat the count.
- Async export remains a future controlled transition requiring queue ownership, private artifact storage, permission recheck, expiry/revocation, and recovery evidence.

## Documentation and evidence

- `apps/web/src/app/(app)/admin/audit/export/route.ts`
- `apps/web/src/server/services/coreAdmin.ts`
- `apps/web/src/server/services/policySettings.ts`
- `packages/database/src/seed.ts`
- `docs/core/06-reporting/REPORTING_AND_EXPORT_SPEC.md`
- `docs/knowledge-base/GLOSSARY.md`
- Focused Core Admin tests, web typecheck, and lint validate the contract.
- GPT-5.6 fallback subagents were used because Code Spark and GPT-5.4 were unavailable.
