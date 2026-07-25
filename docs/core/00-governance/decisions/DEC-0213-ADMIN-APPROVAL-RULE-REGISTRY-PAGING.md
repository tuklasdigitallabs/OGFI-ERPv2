# DEC-0213 — Approval Rules registry stale-page handling

Date: 2026-07-25  
Status: Accepted  
Decision chair: Parent agent  
Deliberators: independent product and architecture reviews (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 models were unavailable)

## Decision

The Approval Rules registry derives a page from its filtered exact total and clamps stale requested pages to the current last page. Existing tenant and selected-company predicates, active/status filtering, deterministic ordering, explicit projection, exact step count, and capped three-step preview remain unchanged. The registry remains read-only; full routing and mutation authority remain on the authorized detail path.

## Required verification

Core Administration contract tests, web typecheck, lint, production build, and diff hygiene must pass. PostgreSQL tenant/company isolation/query-plan, responsive browser/mobile, hosted recovery/deployment, and UAT evidence remain open gates.
