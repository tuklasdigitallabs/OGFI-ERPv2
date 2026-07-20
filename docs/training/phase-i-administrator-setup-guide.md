# Training Module — Phase I Administrator Setup Guide

**Audience:** System administrators and authorized implementation leads  
**Duration:** 60-90 minutes  
**Prerequisites:** Core administration permission, user/role/scope setup access, approval-rule visibility, release-readiness access, master-data access, reports, and audit export access as assigned  
**Related knowledge-base articles:** Signing in and selecting your location; Managing user access and controlled scopes; Managing privileged MFA evidence; Session invalidation and reauthentication; Managing break-glass access; Managing Release Readiness Gates; Why can't I see my branch, warehouse, or request?; Why can't I approve this request?; How to attach supporting documents or photo evidence; How to export a report

## Learning objectives

By the end of this module, participants can:

- Verify users, roles, permissions, and scope assignments.
- Confirm branch and warehouse visibility without over-granting access.
- Check approval assignment and self-approval blockers.
- Review audit events and export permitted audit data.
- Support evidence-reference practices without bypassing source-record controls.
- Review release-readiness gates, security counters, and external-security proof references without treating the ERP page as release approval.

## Demonstration flow

1. Sign in as an administrator.
2. Open administration views for companies, roles, permissions, approval rules, and audit events.
3. Confirm a user's active role assignment and active location scope.
4. Explain why role controls capability and scope controls location visibility.
5. Review an approval rule and identify assigned user or role steps.
6. Open audit events and filter by action, entity, actor, request ID, or date range.
7. Open **Admin > MFA Enrollment** and explain that ERP-side MFA evidence does not replace external provider MFA.
8. Open **Admin > Session Invalidation** and identify records still pending external provider completion.
9. Open **Admin > Break-Glass Access** and explain request, separate approval, expiry, revocation, and post-review controls.
10. Open **Admin > Admin Settings** and review recommended versus overridden DEC-0036 policy defaults.
11. In **Purchasing controls**, explain the recommended approval bands: standard approval from PHP 10,000, high-value review from PHP 50,000, senior/executive review from PHP 200,000, emergency cap PHP 5,000, and 3 quotes from PHP 50,000 estimated request value when quotation comparison is required.
12. In **Security and continuity**, explain the readable retention and backup/restore summaries, then show that raw JSON remains editable only through a reasoned audited override.
13. In **Reporting trust gates**, explain that exports carry scope and trust-gate metadata and that changing policy values does not grant report access.
14. Open **Admin > Release Readiness** and review UAT, deployment, enablement, security, and GO / NO-GO tabs.
15. In the security tab, identify the live counters for MFA gaps, pending provider invalidation, break-glass review, and pending controlled access.
16. Explain the final external-security proof targets required before GO / NO-GO:
    - `external-security/mfa-provider-enrollment-and-runtime-proof.*`
    - `external-security/idp-session-invalidation-proof.*`
    - `external-security/vault-or-artifact-storage-index.*`
    - `external-security/break-glass-review-and-revocation-proof.*`
17. Export permitted audit events and the readiness register as CSV. Confirm the CSV metadata includes report ID, selected scope, trust-gate mode, and `DEC-0036`.

## Practice exercise

Troubleshoot a user who cannot see a warehouse and cannot approve a Purchase Request. Identify whether the issue is role permission, scope assignment, approval-step assignment, source-record status, or self-approval.

Then review a release-readiness security tab with one unresolved item. Decide whether the correct next step is to record ERP evidence, complete an external provider action, collect an external-security proof reference, or keep the gate blocked.

## Common errors and recovery

- Granting company-wide access to fix one missing record: assign the smallest correct scope.
- Confusing view permission with approval authority: approval assignment and scope still apply.
- Changing records directly to bypass workflow: use approved workflow actions only.
- Sharing exports broadly: exports inherit source-record sensitivity.
- Marking a security gate ready because the ERP counter looks acceptable but the external MFA, identity-provider, vault, or break-glass proof reference has not been collected.
- Treating GO / NO-GO reports as approval: they are evidence summaries and still need named Release Board decision records.
- Reading a CSV without checking the metadata rows: always confirm the report ID, selected scope, trust-gate mode, and source decision before using the data.

## Completion check

- Participant can diagnose a visibility or approval issue using role, permission, scope, status, assignment, and audit evidence without weakening controls.
- Participant can explain DEC-0036 policy defaults, readable policy summaries, and reasoned overrides in Admin Settings.
- Participant can verify export metadata before sharing or relying on CSV output.
- Participant can explain which release-readiness evidence belongs in the ERP register and which external-security proof references must remain in the approved provider or evidence repository.
