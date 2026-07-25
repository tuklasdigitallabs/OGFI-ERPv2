# DEC-0219 — Purchase Order amendment TaskSheet unavailable states

Date: 2026-07-25  
Status: Accepted  
Decision chair: Parent agent  
Deliberators: independent product and architecture reviews (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Purchase Order detail keeps the amendment TaskSheet available for the existing bounded eligibility contract: an issued, unreceived PO with no receiving report, pending amendment, or pending balance closure and with the amendment permission. When a visible PO is not eligible, the page renders a read-only `Amendment unavailable` explanation rather than silently omitting the product concept. The reason is selected from already-visible authorization/status/activity facts and does not disclose hidden records.

The existing server action remains authoritative for scope, permission, status, line set, evidence, approval, CAS, audit, and receiving-pause controls. Existing safe action-feedback mappings are retained for validation, stale state, duplicate pending, and receiving conflicts; the page tells users that no amendment was saved and to reopen the current PO before retrying. Unsaved multi-line draft persistence is a separate future enhancement and is not claimed here.

## Required verification

PO visible-surface tests, focused service tests, web typecheck, lint, production build, and diff hygiene must pass. Disposable PostgreSQL authorization/CAS/no-mutation and concurrent-request fixtures, responsive browser/mobile, hosted recovery, and UAT remain open gates.
