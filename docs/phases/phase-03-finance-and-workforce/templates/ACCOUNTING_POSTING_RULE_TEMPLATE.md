# Accounting Posting Rule Template

Use one approved record for each automatic accounting consequence. Do not implement a posting rule solely from a developer interpretation of a source workflow.

## Rule identity

| Field | Value |
|---|---|
| Rule code | |
| Rule name | |
| Version | |
| Status | Draft / Under Review / Approved / Retired |
| Effective from | |
| Effective to | |
| Business owner | |
| Finance owner | |
| Technical owner | |

## Source

| Field | Value |
|---|---|
| Source module | |
| Source document type | |
| Source event / status transition | |
| Source event key / idempotency key | |
| Eligibility preconditions | |
| Source fields used | |
| Required attachments/evidence | |
| Required approvals | |

## Accounting consequence

| Field | Value |
|---|---|
| Journal type | |
| Journal date basis | |
| Accounting period basis | |
| Debit account mapping | |
| Credit account mapping | |
| Amount basis | |
| Rounding rule | |
| Tax treatment | |
| Currency | PHP only |
| Required dimensions | |
| Dimension derivation | |
| Narrative/description format | |

## Controls

| Field | Value |
|---|---|
| Authorization required | |
| Segregation-of-duties requirement | |
| Duplicate prevention / unique key | |
| Transaction boundary | |
| Retry behavior | |
| Failed-posting behavior | |
| Period close behavior | |
| Reversal/correction process | |
| Exception owner | |
| Audit events | |
| Reports affected | |

## Test cases

- Happy path:
- Missing mapping:
- Unbalanced amount:
- Duplicate retry:
- Concurrent request:
- Unauthorized user:
- Closed/locked period:
- Reversal:
- Reporting reconciliation:
