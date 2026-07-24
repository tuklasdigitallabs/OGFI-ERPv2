# DEC-0106 — Optional Controlled Evidence for Supplier Quotations

## Metadata

- Decision ID: `DEC-0106`
- Title: Optional controlled quotation evidence in comparison workspace
- Status: Confirmed for implementation; mandatory evidence remains policy-gated
- Date: 2026-07-24
- Decision owner: Procurement / Quotations workstream
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Quotations

## Decision

Enable optional controlled-evidence links for `SupplierQuotation` through source type `SUPPLIER_QUOTATION`. List, download, upload intent, link, and archive operations must re-authorize the exact quote under tenant, company, and Purchase Request location scope and require `purchasing.quote.manage`. Use the shared scan, quarantine, availability, retention, and download-audit controls. Optional evidence must not satisfy a future mandatory-evidence rule until that rule is confirmed and enforced server-side.

## Rationale and alternatives

- Selected: optional shared controlled-evidence support, because it closes the preservation gap without silently resolving the open conflict between the approval matrix and purchasing workflow.
- Rejected: making attachments mandatory now; the requirement matrix is unresolved and may incorrectly block valid non-file or exception sourcing.
- Rejected: continuing with no capture; it preserves the policy ambiguity and loses useful auditability.
- Rejected: external URL or free-text reference as a substitute for controlled evidence.

## Hard-gate assessment

- Scope is derived from `SupplierQuotation → QuotationRequest → PurchaseRequest`; UI flags are not authorization.
- Scan-pending, rejected, quarantined, or unavailable content is never downloadable or usable as proof.
- Linking evidence never changes quote totals, recommendation status, PO status, approval state, or inventory.
- Archive preserves the attachment link and audit history; no hard delete is introduced.

## Required safeguards and tests

- Test clean, pending, rejected, unsupported, quota/rate-denied, list/download, archive, direct-route permission denial, cross-tenant/company/location denial, and loss-of-scope cases.
- Verify optional evidence does not block recommendation submission and that a later configured mandatory rule can block only after a clean required link exists.
- Keep responsive browser, disposable PostgreSQL, production-build, and hosted release/recovery gates open until evidenced.

## Deliberation evidence

Independent review recommended the optional interim posture with high confidence and identified the approval-matrix/workflow conflict. Requested Code Spark and GPT-5.4 were unavailable in the active toolset; the closest permitted fallback (`gpt-5.6-terra`) was used without relaxing hard gates.
