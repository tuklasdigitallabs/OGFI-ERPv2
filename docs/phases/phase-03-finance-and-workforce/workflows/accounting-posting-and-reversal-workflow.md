# OGFI ERP — Finance Workflow: Accounting Posting and Reversal

**Status:** Detailed planning specification
**Purpose:** Define how approved operational events create controlled accounting consequences without duplicate or partial posting.

## 1. Principle

A source document does not become an accounting record merely because a screen was saved. It becomes an accounting posting candidate only when its documented workflow reaches a valid financial event.

Examples:

```text
Approved PO                 → commitment update, where configured
Accepted goods receipt      → inventory/accrual eligibility, where configured
Validated supplier invoice  → AP liability posting
Released payment            → cash/bank and AP settlement posting
Approved liquidation        → expense/cash clearing posting
Closed bank reconciliation  → authorized reconciliation adjustment, where configured
Approved inventory write-off → inventory/expense posting eligibility
```

The exact account mapping remains configurable and is not hardcoded in source modules.

## 2. Posting states

```text
NOT_APPLICABLE
NOT_READY
ELIGIBLE
POSTING_IN_PROGRESS
POSTED
POSTING_FAILED
REVERSED
SUPERSEDED
```

A source record may also have operational statuses; finance posting state is distinct and must not replace them.

## 3. Controlled posting flow

```text
Source event reaches eligible state
→ resolve posting rule/version
→ validate source, period, dimensions, authorization, and mappings
→ reserve idempotency key
→ create journal header and lines
→ validate debit = credit
→ persist journal, source posting state, and audit event in one transaction
→ mark source as POSTED
→ emit safe downstream notification/event
```

## 4. Idempotency and concurrency

The implementation must prevent duplicate posting from:

- Double-clicked actions
- Browser retry or refresh
- API retry
- Worker retry
- Concurrent user action
- Replayed event
- Database timeout after a partial response

Required design elements:

- Deterministic source event key or unique posting constraint.
- Database transaction around journal creation, posting status, and audit event.
- Safe retry behavior that returns the existing journal if already posted.
- Optimistic version/concurrency protection on source records where needed.
- Explicit failed state with actionable reason when a posting cannot complete.

## 5. Posting rule requirements

Every automatic posting rule must identify:

- Rule name, version, status, and effective dates
- Source document and source event
- Eligibility conditions
- Debit account mapping
- Credit account mapping
- Required dimensions and derivation logic
- Amount basis and rounding rule
- Tax treatment where configured
- Required approvals/evidence
- Reversal behavior
- Exception owner
- Test cases

Use `templates/ACCOUNTING_POSTING_RULE_TEMPLATE.md`.

## 6. Reversal and correction flow

```text
Posted journal
→ correction need identified
→ reason / evidence entered
→ approval if required
→ reversal journal posted
→ replacement journal or corrected source event posted if needed
→ source/reversal/replacement chain visible in audit trail
```

Rules:

- Do not modify or delete the original posted journal.
- Do not reuse source event keys for a different accounting consequence.
- Do not reverse a period-locked entry without a controlled period/reopen process.
- Keep original, reversal, and replacement records visible in reporting with correct net effect.

## 7. Hard failure cases

| Failure | Required behavior |
|---|---|
| Missing account mapping | Do not post; open controlled exception. |
| Journal does not balance | Do not post; retain failure evidence. |
| Period locked | Do not post; require approved exception/reopen path. |
| Source cancelled/invalid | Do not post; preserve audit of attempt. |
| Duplicate source event | Return existing journal; flag only if source data conflicts. |
| Missing required financial dimension | Do not post; route to owner. |
| Permission failure | Block with safe user-facing error; audit security-relevant event where applicable. |
| Transaction failure | Roll back journal, source status, and audit write as one unit. |

## 8. Finance exception ownership

The system must assign or route failed financial postings to a role/queue. A failed posting is not resolved by an informal comment alone. Resolution requires structured reason, corrected mapping/source data, reattempt, and resulting journal reference or authorized closure.

## 9. Test evidence required

- Unit tests for balancing and mapping logic
- API/service tests for duplicate posting and retries
- Transaction rollback test
- Concurrent posting test
- Period-close/locked-period test
- Reversal/replacement chain test
- Authorization and segregation-of-duties negative tests
- Report reconciliation test from source → journal → subledger → GL
