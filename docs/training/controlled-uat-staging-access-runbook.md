# Controlled UAT Staging Access Runbook

**Audience:** UAT testers, Branch Managers, Warehouse and Storekeeper users, Purchasing users, approvers, Project users, System Administrators, QA Leads, and UAT coordinators  
**Use:** Controlled staging UAT only  
**Environment URL:** `https://staging-erp.onegourmetph.com`  
**Status:** Ready to support UAT execution; UAT evidence, defect disposition, and release signoff are pending  
**Related materials:** `docs/core/07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md`; `docs/core/07-quality/PHASE1_PHASE1_5_UAT_EXECUTION_SCRIPTS.md`; `docs/core/07-quality/PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md`; `docs/core/08-knowledge-and-enablement/PHASE1_PHASE1_5_TRAINING_IMPACT_ASSESSMENT.md`

## Purpose

Use this runbook to access the controlled staging environment, select the assigned sample role, run an approved UAT scenario, capture usable evidence, and report defects. Staging access and edge/container health checks do not prove that UAT has passed and do not authorize production use or a GO decision.

## Prerequisites

- You have been assigned a UAT scenario and a sample role by the UAT coordinator.
- You have received the Nginx Basic Auth credentials through the approved separate channel. Do not include those credentials in screenshots, defect records, chat, or this document.
- Your test scope is known: company, brand where applicable, branch, warehouse, project, and the role that you are testing.
- The pilot data and any test counterpart role needed by the scenario are ready. For example, approval and receiving scenarios normally require different authorized users.
- You can capture screenshots and record the browser/device used. Use a phone-sized viewport or mobile device when the assigned script requires mobile coverage.

## Access the staging environment

1. Open `https://staging-erp.onegourmetph.com` in the browser selected for UAT.
2. When prompted by Nginx, enter the Basic Auth credentials issued to you separately.
3. On the ERP sign-in page, select the assigned sample account/role from the available list.
4. Do not enter or request an ERP password for the sample-account sign-in flow. The staging ERP is running in demo authentication mode for UAT.
5. Confirm the signed-in role and active company, brand, branch, warehouse, or project context before opening a record or performing an action.
6. If the intended sample role is not listed, or its scope is incorrect, stop the scenario and report the issue. Do not use another person's sample role or change scope yourself.

**Expected result:** You reach the ERP with the assigned sample role and can verify the intended scope before testing.

## Select and execute a UAT scenario

1. Open the assigned scenario in the [UAT execution scripts](../core/07-quality/PHASE1_PHASE1_5_UAT_EXECUTION_SCRIPTS.md).
2. Check the matching row in the [UAT evidence pack](../core/07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md) for the required evidence and signoff fields.
3. Follow the scripted steps in order. Use only the pilot company, branch, warehouse, project, and records assigned for UAT.
4. Where the script requires a role switch, sign out and select the next assigned sample role. Keep the original record ID available for traceability.
5. For an expected denial, test only the specified safe deep link or action. A denied user must not be given another user's access as a workaround.
6. Stop and report a defect if a result could affect inventory, approvals, authorization, audit history, or the source record. Do not attempt an unapproved correction, reversal, or direct data change.

**Expected result:** The scenario produces a pass/fail result supported by evidence. Transaction outcomes remain limited to the designated UAT records and scope.

## Capture UAT evidence

1. Record the scenario ID, date/time, tester name and sample role, environment (`staging`), device/browser, and active scope.
2. Capture the record number or ID and the meaningful before/after state. Include status, next action or approver when shown, and relevant audit/activity history.
3. Capture the control being proven. Examples include a branch/warehouse scope denial, a different-user approval, a discrepancy reason/evidence reference, or a source-linked inventory movement.
4. For mobile coverage, capture the device or phone-sized viewport and the completed or blocked action.
5. Save evidence in the approved UAT evidence location and enter its reference in the matching evidence-pack row. Keep sensitive credentials, tokens, and unrelated personal information out of the capture.
6. Record the result as pass, fail, or the approved waiver/disposition status only after the coordinator's process is followed. Do not mark a scenario signed off yourself unless you are the named owner.

**Expected result:** A reviewer can identify who tested what, in which scope, what occurred, and where the supporting proof is stored.

## Report a defect or access issue

1. Stop the affected action when there is a possible inventory, money, approval, access-control, audit, or source-record impact.
2. Create the defect in the controlled UAT defect register using the route confirmed by the QA Lead or UAT coordinator. A defect ID may be controlled by the QA Lead or by the project-tracker task number.
3. Include the required intake information: scenario/workflow, sample role, company/brand/location/warehouse/project context, environment, device/browser, source record IDs, expected and actual result, exact user-safe message, evidence reference, and possible data/control impact.
4. Assign or request a severity using the defect runbook: Blocker, Critical, Major, or Minor. Do not classify a suspected authorization breach, duplicate stock posting, or data corruption as a routine usability issue.
5. Record any safe workaround as `None` unless it has been explicitly approved. A workaround must not bypass role scope, approval segregation, immutable inventory-ledger controls, audit history, or source-record boundaries.
6. Wait for the QA Lead or assigned owner to confirm disposition and retest instructions. Attach retest evidence to the same defect record.

**Expected result:** The issue is traceable to a scenario, scope, record, evidence item, owner, and retest result. The defect record does not itself approve a waiver or release.

## Controls and known limits

- This is a staging environment, not a production release, production signoff, or GO decision.
- Nginx Basic Auth credentials are issued separately. Treat them as confidential.
- ERP sign-in uses `AUTH_MODE=demo`: choose an available sample account; no ERP password is used in this flow.
- Sample-account and user access changes are managed manually for this UAT environment. There is no self-service account creation, automated email, or password-reset flow to test or rely on.
- Container and edge health have been verified as an access preflight only. They do not replace executed UAT scenarios, evidence, defect disposition, deployment/rollback proof, training acknowledgement, or named release signoff.
- Do not promise automated email delivery, reset messages, or background job behavior during UAT.
- Use the source ERP record for controlled operational actions. Project tasks may coordinate work and link to records, but must not be used to alter procurement, approvals, receiving, transfers, inventory, wastage, or adjustment states.
- The pilot must not use `All Brands` or `All Locations` for posting, receiving, stock movement, wastage, adjustments, or project source-record mutation tests.

## What happens next

- The UAT coordinator records execution, evidence references, defects or waivers, and owner signoff in the evidence pack.
- QA and the relevant process owner triage failures, arrange a safe retest, and update the defect disposition.
- Training acknowledgement, UAT evidence, deployment/rollback evidence, and final release decisions remain controlled by their named owners. Completion of this runbook does not change release status.

## Related training and help

- [Phase I Branch Manager Quick Start](phase-i-branch-manager-quick-start.md)
- [Phase I Warehouse and Storekeeper Quick Start](phase-i-warehouse-storekeeper-quick-start.md)
- [Phase I Purchasing Quick Start](phase-i-purchasing-quick-start.md)
- [Phase I Administrator Setup Guide](phase-i-administrator-setup-guide.md)
- [Phase 1.5 Project Tracker Quick Start](phase-1-5-project-tracker-quick-start.md)
- [Pilot Hypercare and Defect Runbook](../core/07-quality/PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md)
