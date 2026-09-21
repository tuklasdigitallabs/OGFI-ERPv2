# Inventory Control Pilot — Adversarial UAT Supplement

**Date:** 2026-09-07  
**Status:** Proposed execution checklist; all scenarios below are **Not Run** in this audit  
**Companion:** [Pre-UAT audit and finding evidence](INVENTORY_CONTROL_PRE_UAT_AUDIT_2026-09-07.md)

This supplements P1-UAT scenarios; it does not change approved permissions, policies, release gates, or scope. A failed scenario is defect evidence, not acceptance. A disabled workflow is Blocked, not Passed. Variance is an investigation signal, not proof of theft.

## Admission and evidence

Use an isolated, explicitly admitted candidate with the exact warehouse/branches/SKUs, effective named users, approved evidence policies, and working approval runtime. Keep synthetic documents and stock separate from live operations. During shadow testing, retain the approved manual source of truth.

For each case record candidate SHA/image, configuration revision, environment, company/location, actor and effective role/scope, source IDs, starting/ending quantities, expected/actual outcome, movement IDs/count, approval/audit/evidence IDs, screenshots or redacted network evidence, tester/reviewer, and status. Do not put credentials or unnecessary personal data into artifacts.

Before opening-cutover execution, verify the documented UTC database-session contract for the runtime, command broker and executor connections (`SHOW TimeZone`). Company/user display timezone remains separate. Record this environment evidence; a populated database or successful migration does not prove the session setting.

Use distinct actors for requester, counter, approver, poster, receiver, and reverser where the approved rules require independence. Include actual combined-role assignments; dedicated minimal-role tests alone miss F01. Run branch-critical paths on desktop, tablet, and mobile.

## Cases

| ID | Exercise | Acceptance evidence / expected result |
|---|---|---|
| IC-01 | During a frozen blind count, its counter creates/opens an adjustment for a counted SKU/lot; also opens an existing adjustment. | No protected expected quantity or variance through detail, draft, HTML/RSC/network, or export. Test the combined inventory-requester grants. F01. |
| IC-02 | Counter requests balances, ledger, dashboard drilldowns and exports, including from another device/session. | Approved blind-count restrictions hold across services; reviewer access remains authorized and auditable. |
| IC-03 | Receive delivered 10, accepted 6, rejected/damaged 0. | Final posting cannot silently leave four unclassified delivered units. Correct reason/evidence and remaining disposition or explicit pending handling are required. F02. |
| IC-04 | Create two receipts for one PO, post one, then attempt stale second and reverse first. | Stale state is denied; authorized draft recovery and reversal work without direct DB edits. Verify PO outstanding and net ledger. F06. |
| IC-05 | Submit a decrease using an evidence-required reason with no evidence. Repeat after return and policy change. | Server rejects until approved evidence is satisfied; approval/posting cannot bypass it. F03/F10. |
| IC-06 | Use nonexistent filename, reused/wrong-company reference, missing file, quarantined file, or replaced version. | Only the evidence forms explicitly allowed by policy qualify. Verified external references require the approved custody/reviewer process. A filename alone is not proof of a photo. |
| IC-07 | Enter a material loss with omitted, zero, and understated cost. | Unknown/unverified value cannot silently evade material-loss review. Ordinary approval remains required. F04. |
| IC-08 | Repeatedly waste a high-risk SKU; move it from first to second/last line. Resubmit using another authorized user. | Flags remain line-order independent; history excludes current draft and uses original reporter. F05. |
| IC-09 | Split loss across small documents, items, reporters and days. | Reviewers can reconstruct cumulative patterns under approved policy; threshold splitting is evaluated. Do not assume per-document approval detects collusion. |
| IC-10 | Prepare opening stock with 3 × 0.10 and 1.234567 × 1.23. Retry identical preparation/execution. | Canonical facts and approved decimal precision agree; one correct cutover effect, no duplicate movement. F07. |
| IC-11 | Create a transfer normally for lot/expiry-tracked stock, including split source lots. | Supported allocation, dispatch, receipt and reversal preserve each bucket; no direct fixture manipulation to make the path possible. F08. |
| IC-12 | A user has OPERATE at A and VIEW at B; create/submit loss documents at B via direct actions. | Denied with no source/approval/notification mutation; authorized A operations still work. F09. |
| IC-13 | Substitute foreign tenant/company/location/source IDs and attempt requester self-approval. | Server denies; no stock or approval effects; authorized audit trail records applicable denials. |
| IC-14 | Revoke scope, role, user access or session while review/posting waits; retry from a stale tab. | Live authorization fails safely, with no partial movement or source transition. |
| IC-15 | Lose a successful response and retry dispatch, receipt, wastage, adjustment and reversal; submit concurrently. | Exactly one authorized effect and coherent original/reversal lineage; no duplicated stock or source quantities. |
| IC-16 | Race stock movements against count start/freeze/close at the same location. | One valid serialized outcome, exact cutoff quantities, no stock loss/duplication. Different authorized locations remain correctly isolated. |
| IC-17 | Count a shortage, submit, request recount, supersede prior attempt and generate/post one correction. | **Blocked until approved recovery activation.** Immutable attempts, independent required actors and exactly one authoritative count-linked adjustment. Manual adjustment is not substitute acceptance for P1-UAT-011. |
| IC-18 | Save a count of 80, correct to 100; discover an unexpected SKU/lot. | Reviewer can investigate persisted corrections according to approved audit policy; unexpected stock follows a controlled exception path. Document limitations explicitly. |
| IC-19 | Receive less than dispatched; dispute and attempt settlement/reversal, including a returned/rejected source. | In-transit stock and both endpoints reconcile; unresolved dispute remains visible. Disabled settlement remains Blocked, never bypassed. |
| IC-20 | Seed diagnostic population counts with unrelated tenants, future roles or missing named credentials/routes. | Readiness cannot admit the intended pilot using unrelated counts; exact cohort and effective actors required. F11. |
| IC-21 | Check every included visible tab, detail, action, export and next-step link with each role. | Working behavior, documented read-only purpose, or clear denial/disabled reason. Loading/error/unavailable cannot masquerade as empty or zero exceptions. |
| IC-22 | On synthetic physical stock, remove units without recording a movement; leave cache/ledger consistent. | Independent count/document reconciliation identifies discrepancy despite zero ledger-cache variance. Assign investigation owner; do not label it theft automatically. |
| IC-23 | Simulate false receipt, receiver/custodian collusion, reused evidence, delayed dispatch paperwork and shared accounts. | Independent delivery/custody checks and named-account controls expose or constrain the scenario. Record residual collusion risk that software cannot prevent alone. |
| IC-24 | Rehearse outage, documented fallback, isolated restore and replay/reconciliation. | Source evidence, approvals, movement lineage and physical reconciliation survive; no duplicate replay. Hosted exact-candidate evidence and owner signoff still required. |

## Exit criteria

- Resolve audit findings affecting the admitted cohort and rerun their negative and positive cases.
- Complete database-backed authorization, concurrent posting/retry, rollback, and migration checks on the exact candidate; unit/source assertions alone do not pass them.
- Execute the connected named-role UI journeys and independent physical reconciliation. Record failure/blocker evidence even where other parts pass.
- Confirm the policy-dependent evidence, cost, count/recount, lot and segregation decisions before enabling their actions.
- Obtain required Operations, Inventory/Accounting, Security/QA and Release approvals under the existing release policy. Operational stock-of-record remains NO-GO until all mandatory gates pass.
