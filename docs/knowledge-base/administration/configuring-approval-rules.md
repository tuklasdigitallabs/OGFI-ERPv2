# Configuring Approval Rules

## Who can use this

Only an administrator with Core Administration, tenant-role administration, Manage
access to the selected company, and current privileged-MFA proof can change Approval
Rules. Local sign-in requires a fresh MFA step-up; externally authenticated users
require verified privileged-MFA evidence. Viewing a rule does not grant authority to
approve a transaction.

## Create a company rule

1. Select the company context, open **Admin → Approval Rules**, and choose
   **Create Approval Rule**.
2. Select a supported transaction type. Use **Default** unless you are configuring
   the documented Purchase Request emergency route.
3. Add the required approval roles in order. Every step is sequential and required.
4. Enter the change reason and save. The new version is **Inactive** and cannot route
   a submission yet.
5. Review the saved version, then choose **Activate Version** and provide the
   activation reason. Activation replaces the current active version for that exact
   company route in one controlled action.

The server rechecks that every role is active, contains the approval permission for
the transaction, and has an active/effective member in the selected company. A role
that merely appears in the list is not guaranteed to remain eligible when you save or
activate.

## Revise or roll back

Choose **Revise Rule** from a company-owned rule. A revision creates another inactive
version with its own steps; it never edits the selected historical version. Review and
activate the successor when ready. To roll back, activate a retained validated prior
version through the same reason- and MFA-controlled action. Documents already in an
approval cycle keep their original rule and steps.

## Deactivate a route

Deactivate only when future submissions for that route must stop. Deactivation does
not cancel or reroute approvals already in progress. Until another valid version is
active, a new submission may be blocked with **Approval rule not configured**.

## Intentional limits

- Tenant-wide rules are read-only because cross-company policy ownership is not yet
  confirmed.
- Rules with named-user (`USER`) steps remain historical/read-only and are never
  silently converted to roles.
- Amount, budget, brand, location, department, category, supplier, date, group,
  parallel, optional, delegation, escalation, and arbitrary JSON conditions are not
  available in this composer. Do not assume that a field shown in raw historical
  scope data is configurable or enforced for a new version.
- Every lifecycle action is audited. Retrying the same saved action is safe only when
  its protected request content is unchanged.

If an action reports that the version is stale, reload the rule and review the active
version before trying again. If a role is unavailable, correct its permission and
company assignment through the authorized access workflow instead of bypassing the
rule validation.
