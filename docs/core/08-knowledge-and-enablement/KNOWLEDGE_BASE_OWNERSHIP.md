# OGFI ERP — Knowledge Base Ownership and Handoffs

## Purpose

This document prevents conflict between internal specifications and user-facing enablement content.

## Ownership

| Area | Owner | May edit | Must not do |
|---|---|---|---|
| Source-of-truth specifications | Mithi | Core and phase specifications, internal technical docs, changelog | Write user guidance that creates undocumented behavior |
| User-facing knowledge base | Dunong | `docs/knowledge-base/` | Change workflow, approval, permission, data, or technical specs |
| User-facing release summaries | Dunong | `docs/release-notes/` | Claim a feature is released without a confirmed release decision |
| Training material | Dunong | `docs/training/` | Define unapproved SOPs or policies |
| Adoption readiness review | Sinag | Read-only review and recommendations | Rewrite source rules or release without authorization |
| Business-flow correctness review | Dalisay | Read-only review and recommendations | Define undocumented policy as fact |

## Required handoffs

1. **Implementation changed** → Parent agent asks Mithi to update source specifications when required.
2. **Behavior confirmed** → Parent agent asks Dunong to create or update user-facing help content.
3. **Branch-facing workflow** → Parent agent may ask Sinag to review clarity and adoption readiness.
4. **Workflow-sensitive article** → Parent agent may ask Dalisay to check business-flow accuracy.
5. **Conflict discovered** → Dunong logs the issue in `OPEN_KNOWLEDGE_BASE_GAPS.md`; parent agent resolves it through the proper source-of-truth process.

## Definition of ready for user-facing documentation

Dunong may write final user guidance only when:

- The workflow is approved or the implemented behavior is stable enough to document.
- The user role and location scope are known.
- Status transitions and error behavior are known.
- Required evidence, approval, and audit behavior are known where applicable.
- The screen has a stable navigation path and visible labels.

When those are incomplete, Dunong may create a draft outline or gap entry, but must not publish invented instructions.
