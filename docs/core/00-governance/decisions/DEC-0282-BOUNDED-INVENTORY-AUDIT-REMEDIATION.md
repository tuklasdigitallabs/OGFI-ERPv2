# DEC-0282 — Bounded Inventory Audit Remediation

## Metadata

- Status: **Confirmed; targeted engineering verification passed; no release authorization**
- Date: 2026-09-07
- Decision Chair: Parent implementation agent
- Related phase/module: Phase I Inventory Control Pilot
- Related decision brief: `REM-2026-09-07`, parent-led independent Astra security, movement-integrity and loss-control deliberation, with targeted challenge
- Authority: Parent confirmed the bounded option following the user's instruction to proceed.

## Decision

Close the reproduced concealment, evidence, scope, receiving recovery, precision and lot-custody gaps within existing Phase I controls. Retain unresolved valuation, controlled-evidence qualification, recount recovery, settlement finality and operational-admission gates.

## Context and alternatives

The [baseline audit](../../07-quality/INVENTORY_CONTROL_PRE_UAT_AUDIT_2026-09-07.md) found quantity disclosure to combined-role counters, unclassified receiving outcomes, ignored configured evidence, incomplete repeat detection, stale-receipt recovery and decimal/lot limitations.

| Option | Assessment |
|---|---|
| Bounded service and UI remediation — selected | Repairs known paths using existing transaction, authorization and ledger patterns. Risks are missed indirect read paths, policy revalidation races, and legacy deficient records; negative and concurrent PostgreSQL tests are required. |
| UI hiding or dedicated minimal-role tests only — rejected | Leaves direct reads and real combined grants exposed; fails server authorization/confidentiality gates. |
| Broad valuation, evidence-policy or recount activation — deferred | Could resolve additional operational limitations, but would invent unconfirmed policy or bypass existing release gates. |
| Proceed to operational UAT without repair — rejected | Known concealment and recovery defects remain. Isolated diagnostics do not grant operational authority. |

## Confirmed safeguards and implementation impact

1. Apply existing blind-count confidentiality predicates to quantity-bearing reads, exports, adjustment projections, approval review, audit and linked-record paths. Hold sorted location read fences through eligibility and projection; count scheduling/start uses the matching exclusive boundary. Preserve historical count-origin protection and independent reviewer eligibility. A protected workspace returns an explicit unavailable reason, never fabricated zero balances.
2. Revalidate live operational scope inside loss-document create/submit transactions. VIEW at the selected location does not authorize mutation because OPERATE exists elsewhere. Existing approval segregation and stricter posting/reversal checks remain.
3. Revalidate active reason and configured reference requirements at create, submit and post. A header reference covers all applicable lines; otherwise each applicable line needs a reference. Wastage reason/policy requirements cover all lines; category-only requirements cover the affected lines. This validates **reference presence only**, not photo identity, ownership, malware state or approved evidence qualification.
4. Evaluate repeat wastage for every distinct item, exclude the current document, and retain the original reporter on resubmission. Preserve the historical line-count metric; show item-specific history and its interpretation. Label positive requester cost as unverified and missing/zero cost as unknown. This does not repair F04 monetary policy classification or approve a valuation source.
5. Require exact delivered = accepted + rejected + damaged before receipt creation/posting. Short quantity is not a delivered-unit outcome. Preserve accepted-only stock effects and outstanding PO quantities.
6. Register `inventory.receiving.cancel` without default role grants. Cancel only DRAFT receipts with a required reason, live authorization, ordered PO/line/receipt locks and status CAS. Preserve actor/time/reason audit, create no movement, and allow stale draft recovery before authorized reversal.
7. Compute opening quantity × cost with Decimal precision 40 and HALF_UP rounding to six decimal places. Inputs beyond supported six-place precision and values that cannot preserve canonical numeric compatibility fail closed. Preserve existing valid numeric hashes and immutable rows. The database CHECK uses `round(product, 6)`.
8. Choose required transfer lot/expiry in draft and bind them into approval payload identity. Dispatch verifies those buckets; receipt and reversal retain custody identity. No automatic allocation or post-approval silent substitution is introduced.

All changes preserve tenant/company/location isolation, server authority, segregation, immutable ledger/audit history, transactional posting and retry identity. No production configuration, role assignment or stock data is changed by this decision.

## Migration and rollback

`20260907100000_inventory_receiving_cancel_and_opening_precision` registers the permission and replaces the opening product CHECK without rewriting history. Application rollback must disable cancellation/revoke separately granted authority while preserving records. Restore the old exact-product CHECK only after proving no stored rounded products differ; otherwise retain the compatible CHECK. Never rewrite immutable opening evidence to permit rollback.

## Evidence and follow-up

Implementation references: `receiving.ts`, `transfers.ts`, `openingInventoryCutovers.ts`, `stockAdjustments.ts`, `wastage.ts`, `operationalReasonCodes.ts`, and shared confidentiality/evidence helpers under `apps/web/src/server/services/`; matching tests and migration. The audit appendix is the verification register; design confirmation does not imply every test has passed.

| Follow-up | Owner | Gate/status |
|---|---|---|
| Finish corrected regression, lint, typecheck and PostgreSQL evidence | Engineering/QA | Passed targeted checks; audit appendix records scope and UTC environment correction |
| Confirm authoritative loss valuation and unknown-value treatment | Operations and Inventory/Accounting | OPEN; F04 remains unresolved |
| Qualify required controlled evidence | Operations/Security/Release | Existing policy gates retained; text reference is not qualified evidence |
| Execute named-role browser/mobile and physical reconciliation cases | QA/Operations | Not run in this pass; exact candidate admission required |
| Update role-based help and training impact | Dunong | Nine guides, KB gaps and local release note updated; rehearsal remains pending |
| Activate recount/settlement/operational stock of record | Authorized owners | Not authorized by DEC-0282 |
