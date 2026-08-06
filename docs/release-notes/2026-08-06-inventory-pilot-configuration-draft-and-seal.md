# OGFI ERP Release Note — Inventory Pilot Configuration Draft And Seal

**Release date:** August 6, 2026

**Audience:** System Administrators, Super Administrators, Inventory Pilot owners, UAT coordinators, Operations and Accounting reviewers, and release owners
**Affected locations / roles:** Local implementation and controlled UAT only after the listed gates pass; no staging/VPS or production availability announcement

## What changed

- A company-scoped authoring boundary separates mutable Inventory Control Pilot configuration drafts from immutable sealed revisions.
- Drafts record explicit location endpoint capabilities, exact high-risk Item IDs, named actor evidence, and readiness inputs. The supported endpoint capabilities are transfer source, transfer destination, count location, and opening-stock location.
- Opening readiness uses five distinct named actors: preparer, submitter, Operations reviewer, Accounting reviewer, and command requester. The deployment-controlled executor is not selected or granted through the draft.
- Sealing creates exactly eight point-in-time readiness snapshots: Purchase Request, Quotation Recommendation, Purchase Order, Inventory Transfer, Stock Count Attempt Review, Wastage Report, Stock Adjustment, and Opening Inventory Cutover.
- The Purchase Request snapshot certifies only the standard, non-emergency `DEFAULT` route through resolver `purchase_request_approval_rule_v1`. A valid `PR_EMERGENCY` route may coexist, but it is not certified by this snapshot and receives no emergency-scenario UAT credit.
- Draft Routes/Readiness and sealed detail display the retained Purchase Request resolver ID, `isEmergency=false`, selected `DEFAULT` route, `normal` route type, and `fallbackUsed=false`; missing or malformed resolver evidence is shown as unavailable rather than inferred.
- A separate authorized sealer must hold the dedicated seal permission, exact Company `MANAGE`, and fresh MFA. The draft creator or current editor cannot seal the same draft.
- A successful atomic seal creates an immutable revision, memberships, readiness evidence, canonical content, and verified digest. A validation or concurrency failure creates no partial sealed revision.
- Corrections use a higher successor revision. Eligible new Opening Inventory cohorts may use the latest sealed revision through the separate selection path; existing cohorts remain pinned to their original revision and digest.

## What you need to do

- Do not exercise the configuration workspace until the service, migration, authorization, PostgreSQL, responsive UI, and controlled-UAT gates have passed.
- When the gates pass, use two separate sample administrators for the draft and seal exercises. Verify exact Company context, permissions, Company `MANAGE`, fresh MFA, endpoint capabilities, selected Item IDs, named actors, and all eight readiness families.
- Resolve displayed readiness blockers in the authoritative source records. Do not use a snapshot as proof of current permission, scope, approval authority, or route eligibility.

## Important notes

- This release note does not announce production, staging/VPS, or GO availability. Local implementation and UAT use may be announced only after their respective evidence gates pass.
- Sealing records configuration and evidence only. It does not activate a pilot, approve a request, change a source status, create opening stock, request an opening command, post inventory, update a balance, transfer custody, or create a financial entry.
- Readiness snapshots are immutable seal-time evidence, not current or permanent authority. Every workflow action continues to recheck live permission, assignment, scope, segregation, MFA, routing, and source state.
- Purchase Request emergency routing remains outside this readiness certification. Do not report a sealed standard-route snapshot as evidence that `PR_EMERGENCY` has passed UAT.
- Requested Code Spark and GPT-5.4-mini reviewers were unavailable during the decision review. The confirmed record used the closest permitted fallback without relaxing the hard gates.

## Local/UAT readiness gates

- Complete and verify the normalized draft, compiler, immutable readiness, permission, and audit implementation.
- Pass atomic sealing, exact digest/family/item membership, privilege separation, concurrent retry, immutability, successor/pinning, and zero-side-effect PostgreSQL tests.
- Verify the visible draft, review, blocker, disabled, conflict, immutable-detail, tablet, and mobile states and align this guidance with the final labels and navigation.
- Keep downstream runtime selection and route/readiness consumers separately gated; this configuration seal alone does not prove those consumers are active.

The controlled production-authenticated browser fixture and desktop/mobile test contract are implemented locally. Fixture provisioning, disposable cleanup, production build, contract tests, and browser discovery pass. The complete trusted-CA browser run, named-user UAT, hosted recovery/deployment, signed evidence, and owner authorization remain required; this source milestone is not a UAT or release announcement.

## Learn more

- [Preparing And Sealing An Inventory Pilot Configuration](../knowledge-base/administration/preparing-and-sealing-an-inventory-pilot-configuration.md)
- [Using The Opening Inventory Cutover Pilot](../knowledge-base/warehouse-inventory/using-the-opening-inventory-cutover-pilot.md)
- [Opening Inventory Cutover Pilot Training](../training/opening-inventory-cutover-pilot-training.md)

## Support

Record missing permissions, scope, actor separation, route readiness, digest, seal, successor, or cohort-pinning issues in the controlled UAT evidence pack and escalate them to the Inventory Pilot release owner. Do not bypass a blocker or modify sealed data.
