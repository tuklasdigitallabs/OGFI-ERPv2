# DEC-0143 — Item Selected Action Composer and Base-UOM Guard

**Status:** Implemented checkpoint; selected-Item edit/deactivation behavior superseded by `DEC-0241`; Master Data remains in progress
**Date:** 2026-07-24  
**Decision Chair:** Parent agent  
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Item edit and deactivation now use a selected item URL state and one focused action composer instead of repeating full mutation forms in every row. The composer preserves bounded search/status/page context through success and error redirects and resolves the selected item through a scoped detail read.

The service blocks base-UOM changes once the item has posted inventory movement history. The check locks the item row, rechecks movement existence inside the transaction, and returns `BASE_UOM_CHANGE_REQUIRES_MIGRATION`; unchanged base-UOM edits remain allowed. UI controls do not replace server enforcement.

## Safeguards and validation

- Selected item, category, and UOM reads remain tenant/company scoped and active-validated.
- Option catalogs include selected values and return active rows for empty searches; selected inactive values remain visible only for edit context.
- Conversion creation now uses the bounded active item/UOM catalogs and disables only when the catalog reports overflow.
- Focused item tests (8), typecheck, lint, and diff checks pass.
- Disposable PostgreSQL race/isolation, browser deep-link/mobile, hosted recovery, and UAT evidence remain open.
- Category and UOM rows now expose the same selected-control pattern; their legacy row forms are disabled with an explanation while the selected composer is authoritative.
- Conversion edit now uses a scoped selected conversion composer with context-preserving redirects; row edit controls are disabled with guidance. Conversion creation remains bounded by active option catalogs.

## Supersession note — 2026-07-26

`DEC-0241` retains the selected-Item URL/context pattern but supersedes this
decision's broad Item edit and direct-deactivation behavior. Current maintenance
permits only a reason-bearing Item Name correction protected by an exact scoped row
lock, `ACTIVE` check, and `expectedUpdatedAt` compare-and-swap. Material fields are
read-only and direct deactivation fails closed until the documented governance
workflow exists. The historical base-UOM migration guard remains applicable to any
future governed material-edit flow.
