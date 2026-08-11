# Phase II Local UAT — Servings and Consumption

## Purpose and admission

This runbook validates the default-off `DEC-0279` workflow locally. It does not
authorize production use. Test only with named accounts, MFA, exact branch scope,
and non-production inventory.

Before testing, an administrator must configure:

- the exact branch and default inventory issue location;
- a company-default service-period schedule or an audited branch override;
- active brand menu items and an effective inherited brand-default published
  recipe, or an approved branch override, for each offered item;
- UOM conversions and eligible lot/expiry balances for every recipe ingredient;
- the reviewed high-shrink sentinel cohort;
- encoder, verifier, poster, and remote-review permissions with exact branch scope.

## Role sequence

### 1. Administrator

1. Select the branch context and open **Restaurant Ops → Servings & Consumption →
   Settings**.
2. Create a configuration version with timezone, non-overlapping service periods,
   exact issue location, sentinel ingredients, and reason.
3. In **Recipes & Costing**, confirm each active menu item has the correct brand.
   Publish the approved formula, then use the separate rollout control to adopt
   or advance its brand default at a reviewed Company-local service boundary.
4. In **Servings & Consumption → Settings**, confirm each offered item resolves
   to `Brand default` or an approved `Branch override`. Use `Unavailable` only for
   an item the branch does not offer; pending cost alone must not block quantity
   readiness.
5. Activate the reviewed configuration. Confirm no other configuration is active
   for the same branch and effective period.

### 2. Branch Staff or Supervisor

1. Open **Record servings**.
2. Create a draft for a closed service period with at least two paid items.
3. Add one complimentary item with a reason and reference.
4. Save, reopen, edit a quantity, and submit.
5. Confirm the declaration shows `SUBMITTED` and inventory has not changed.

### 3. Branch Manager

1. Sign in with a different named account and current MFA.
2. Open the declaration and verify the serving facts.
3. Confirm recipe/UOM snapshots appear and inventory still has not changed.
4. Select **Post Consumption**.
5. Confirm status `POSTED`, expected quantities, FEFO lot allocations, ledger
   `CONSUMPTION_OUT` movements, and the updated ledger-derived balances.

### 4. Correction and recovery

1. Repeat the post action and confirm no duplicate movement is created.
2. Reverse the posted document with a reason. Confirm exact opposite `REVERSAL`
   movements and balance neutrality.
3. Create a corrected revision, edit it, submit, verify, and post it as a new
   linked revision.

## Required negative cases

- Encoder attempts self-verification: denied with zero mutation.
- Encoder attempts posting: denied with zero mutation.
- Manager without exact branch scope or live permission: denied without disclosure.
- Missing or expired MFA: denied with zero movement.
- Missing recipe/UOM/issue-location readiness: declaration preserved as blocked;
  zero movement.
- Insufficient eligible FEFO stock: complete post rolls back; no posting header,
  movement, or balance change.
- Attempt during a stock-count freeze or across a controlled count cutoff: denied.
- Complimentary line without reason/reference: rejected before submission.
- Staff meal entered as a menu serving: reject the UAT case and route it to the
  separate Authorized Consumption process.
- Prepared but unserved item: route to Wastage and confirm it is not also posted
  through consumption.

## Evidence checklist

Capture desktop and mobile screenshots, actor/account names, branch context,
business date/service period, declaration and posting IDs, recipe snapshot hash,
movement IDs, before/after balances, audit events, denial results, and reversal
receipts. Reconcile the filtered CSV export to the declaration and ledger.

The workflow passes local UAT only when every positive and negative case succeeds,
no declaration is partially posted, and Operations, Inventory, QA, Security, and
Product sign the exact candidate/configuration evidence.
