# docs/AGENTS.md — Documentation Rules

## Canonical documentation

`docs/` contains the canonical ERP documentation. Archived exports must never become a competing source of truth.

## Structure rules

- Preserve the separation between `docs/core/` cross-phase standards and `docs/phases/` build-specific specifications.
- Do not mark a planned Phase II–V framework as approved behavior until its rules are actually finalized.
- Keep headings, file naming, links, and ownership consistent with `DOCUMENTATION_MAP.md`.
- Add unresolved requirements to `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md`; do not guess.
- Update the changelog and document control metadata only when a behavior-changing decision has been made.
- Keep documentation concise, operationally specific, and testable.

## Documentation working style

- Read the smallest relevant source sections and immediate dependencies first; do not scan the entire documentation tree unless the task requires a map-level change.
- For non-trivial documentation changes, state the expected files and update only the canonical documents that the behavior change affects.
- Do not duplicate content merely for convenience. Link to the source-of-truth document instead.
- Keep change notes, review summaries, and validation output concise.
- Token efficiency never permits skipping document-control, decision-record, knowledge-base verification, or cross-document consistency requirements.


## Knowledge-base documentation rules

- `docs/knowledge-base/`, `docs/release-notes/`, and `docs/training/` are user-facing enablement documentation, not business-policy source documents.
- Their content must be derived from approved specifications and verified implemented behavior.
- Do not use help articles, FAQs, or release notes to establish a new workflow rule, approval rule, role permission, or technical decision.
- Record conflicting or missing information in `docs/knowledge-base/OPEN_KNOWLEDGE_BASE_GAPS.md`.
- Follow `docs/core/08-knowledge-and-enablement/KNOWLEDGE_BASE_STANDARD.md` and use the templates under `docs/templates/`.

## Subagent deliberation documents

For material decisions, documentation work must follow the parent-led protocol in `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`.

- Mithi may create or update a decision record only after a conclusion is confirmed by the parent agent or an authorized human owner.
- A decision record must not convert an unresolved discussion into policy.
- Open questions belong in `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md`.
- Dunong must never document an unconfirmed or unavailable behavior as a user instruction.


## Projects & Implementation documentation

For Phase 1.5 project-tracker documents, preserve the source-of-truth boundary: project tasks coordinate work and reference controlled ERP records; they do not redefine or mutate procurement, inventory, approval, or finance workflow. Update Phase 1.5 workflow/spec/data/quality docs together when a project task state, visibility rule, source-record link, notification, or mobile behavior changes.
