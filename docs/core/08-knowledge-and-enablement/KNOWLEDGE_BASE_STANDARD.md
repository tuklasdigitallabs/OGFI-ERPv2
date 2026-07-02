# OGFI ERP — Knowledge Base Standard

**Status:** Foundation / Approved Baseline  
**Applies to:** All current and future phases  
**Primary owner:** Dunong — Knowledge Base and Enablement Writer  
**Source-of-truth owner:** Mithi — Technical Writer and Documentation Steward

## Purpose

The knowledge base converts approved ERP behavior into plain, task-focused guidance for real users. It is designed for restaurant branches, warehouses, purchasing, finance, management, system administration, and future client organizations.

A knowledge-base article explains **how to use an approved feature**. It does not define business policy, technical architecture, approval thresholds, or workflow rules.

## Content hierarchy

1. Source-of-truth specifications define required behavior.
2. Implemented behavior verifies what users actually see.
3. Knowledge-base content explains that behavior in role-appropriate language.
4. When sources conflict or required details are unknown, record the issue in `docs/knowledge-base/OPEN_KNOWLEDGE_BASE_GAPS.md`.

## Required article sections

Every how-to article must include:

1. Title
2. Audience / required role
3. Purpose
4. Prerequisites
5. Navigation path
6. Numbered steps
7. Expected result
8. Important controls and warnings
9. Related records or next action
10. Related articles

Use `docs/templates/KNOWLEDGE_BASE_ARTICLE_TEMPLATE.md`.

## Writing rules

- Write in plain, direct English.
- Use the official terms from the data dictionary and UI.
- State which branch, warehouse, company, brand, or project scope applies.
- State approval, audit, inventory, and financial impact when relevant.
- Use action verbs: Select, Enter, Attach, Submit, Approve, Receive, Dispatch, Count, Review.
- Describe the result after a critical action.
- Never claim a user can perform an action that their role may not be permitted to perform.
- Do not use made-up screenshots. Use a specific placeholder when the visual is not available.
- Keep one article focused on one complete user goal.

## Required user-facing controls

Explain these whenever they affect the task:

- Location / branch / warehouse selection
- Role or permission limit
- Current status and next status
- Approval requirement and next approver
- Required reason, attachment, or photo evidence
- Inventory or financial impact
- Rejection, return-for-revision, cancellation, or reversal outcome
- Audit-history visibility

## Content lifecycle

| Trigger | Required action |
|---|---|
| New user-facing feature | Assess whether a help article, release note, and training update are required |
| Changed navigation, field, status, or action | Update affected article(s) before release |
| Changed role/permission behavior | Update article audience, prerequisites, and access notes |
| New known issue or recurring support question | Add or update a troubleshooting article |
| Policy or behavior conflict | Log a gap; do not publish uncertain guidance |

## Phase I priority articles

- Signing in and selecting a location
- Understanding dashboard tasks, notifications, and statuses
- Creating and submitting a Purchase Request
- Reviewing and approving a request
- Receiving a complete or partial supplier delivery
- Dispatching and receiving a warehouse transfer
- Performing a stock count
- Logging wastage
- Resolving common permission, branch-scope, and receiving issues
