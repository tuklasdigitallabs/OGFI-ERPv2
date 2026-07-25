# DEC-0211 — Organization Scope selected-company context

Date: 2026-07-25  
Status: Accepted  
Decision chair: Parent agent  
Deliberators: independent product and architecture reviews (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Organization Scope is explicitly presented as the selected-company workspace. The header names the selected company, the summary tab is labeled `Selected company summary`, and the workspace explains that Brand, Department, and Location registries and create actions are selected-company scoped. It is not a tenant-wide company directory. User Access remains the authority for assigning user scope.

No service authorization or company-selection behavior changes. Existing tenant, selected-company Manage, bounded registry, and mutation guards remain authoritative.

## Rationale and safeguards

- Panel-level context prevents a plural Companies label from implying a tenant-wide directory.
- The selected-company label is visible beside the existing global scope badges and persists across the Organization Scope tabs.
- The copy distinguishes organization-record administration from User Access scope assignment.

## Required verification

Core Administration contract tests, web typecheck, lint, and production build must pass. Responsive browser/mobile, PostgreSQL isolation/query-plan, hosted recovery/deployment, and UAT evidence remain open gates.
