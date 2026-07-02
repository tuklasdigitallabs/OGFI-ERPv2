# OGFI ERP — Decision Scorecard

## Purpose

This scorecard makes trade-offs explicit after hard gates have been passed. It does not replace judgement, source-of-truth rules, or a blocking security/inventory/audit finding.

## Step 1: Hard gates

Reject or redesign an option that fails any applicable gate:

- Tenant/company/brand/location scope isolation
- Server-side authorization
- Approval segregation / no self-approval
- Immutable inventory ledger and audit history
- Transaction consistency and idempotency
- Phase scope discipline
- Recovery, reversal, migration, or rollback path

## Step 2: Weighted comparison

Score only options that pass hard gates. Use a 1–5 score per criterion.

| Criterion | Weight | What to assess |
|---|---:|---|
| Operational correctness and control | 30% | Does it preserve restaurant, purchasing, inventory, approval, and audit controls? |
| Business value | 20% | Does it solve a real operational or management problem now? |
| User adoption and branch usability | 15% | Can target users complete it correctly under real branch/warehouse conditions? |
| Delivery effort and risk | 15% | Can it be delivered reliably in the current phase without broad rework? |
| Maintainability and scalability | 10% | Does it fit the agreed stack, modular architecture, and multi-tenant future? |
| Operating cost | 5% | Does it create sustainable hosting, support, or manual-process cost? |
| Reversibility | 5% | Can the decision be safely changed later without corrupting data or retraining everyone? |

## Scorecard table

| Criterion | Weight | Option A | Option B | Option C |
|---|---:|---:|---:|---:|
| Operational correctness and control | 30 |  |  |  |
| Business value | 20 |  |  |  |
| User adoption and branch usability | 15 |  |  |  |
| Delivery effort and risk | 15 |  |  |  |
| Maintainability and scalability | 10 |  |  |  |
| Operating cost | 5 |  |  |  |
| Reversibility | 5 |  |  |  |
| **Weighted total** | **100** |  |  |  |

## Interpretation

- A higher score is useful only if all hard gates are satisfied.
- Document why a lower-scoring option was selected if a critical qualitative factor outweighs the arithmetic.
- Do not use a score to override a blocking security, inventory, approval, audit, tenancy, or legal/compliance risk.
