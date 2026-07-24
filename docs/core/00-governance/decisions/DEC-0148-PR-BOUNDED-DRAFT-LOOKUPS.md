# DEC-0148 — Purchase Request Bounded Draft Lookups

**Status:** Implemented checkpoint; browser/database/hosted/UAT gates remain open
**Date:** 2026-07-24
**Decision Chair:** Parent agent
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Purchase Request draft entry uses an authenticated server lookup endpoint for catalog items, item-valid UOMs, and active budget lines. Each lookup is tenant/company/location scoped, queryable, deterministically ordered, exactly counted, and bounded to a validated page size. Selected IDs are retained in search results so an existing line does not silently lose its label or valid UOM context.

## Controls and validation

- Permission and authorized-location checks run before lookup reads.
- Catalog UOM results are restricted to the selected item's base, purchase, issue, and configured conversion endpoints; create-time relationship validation remains authoritative under DEC-0147.
- The editor exposes independent item, UOM, and budget page controls with exact page counts; selected IDs are merged into a visible page when they fall outside the requested page. No silent truncation authorizes a draft.
- The create sheet keeps Company, Brand, Location, and Requester context visible, groups paging controls to active searches, and exposes an explicit retry action after lookup failure. Department and cost-center values remain unrepresented because they are not in the authorized session context.
- Emergency free-text entry remains available under the existing emergency controls.
- Focused Purchase Request tests (13), typecheck, lint, and diff checks pass for this checkpoint. Authenticated responsive-browser, disposable-PostgreSQL authorization/query evidence, hosted recovery, and UAT remain open.
