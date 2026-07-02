# Phase IV — Build Backlog and Acceptance Criteria

**Status:** Planned backlog framework

## Objective

Manage new restaurant sites from pipeline and feasibility through capex, construction, permits, opening readiness, handover and post-opening review.

## Backlog Structure

Every build item must include:

- User story and business owner
- Role and scope affected
- Workflow reference
- Data entities and API impacts
- Screen specification and responsive behavior
- Validation and exception paths
- Audit, notification and reporting impact
- Unit, integration, role-permission and UAT acceptance criteria

## Required Epics

- Site pipeline and evaluation
- Feasibility and executive approvals
- Lease, mall, legal and permit document controls
- Capex budget and project procurement
- Construction milestones, risks and change orders
- Opening readiness, handover and post-opening performance review

## Phase Acceptance Gate

The phase may proceed to UAT only when:

1. All priority workflows pass end-to-end tests.
2. Transactions preserve company, brand, location/project, department, requester, status and audit context.
3. Role and segregation-of-duties rules pass negative tests.
4. Mobile use cases work for relevant branch, warehouse, project or field users.
5. Reports, exports, notifications, exception handling and rollback behavior are verified.
6. Required master data, migration and configuration activities are completed.
