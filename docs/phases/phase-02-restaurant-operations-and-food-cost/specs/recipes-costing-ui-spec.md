# OGFI ERP — Phase II UI Specification: Recipes and Costing

**Status:** Costing foundation, controlled recipe workflow, default-off `DEC-0279` serving consumption, and the `DEC-0280` brand-default adoption hierarchy implemented and verified locally; named-role browser UAT and production activation remain pending
**Visual standard:** Modern SaaS UI with restaurant-grade operational control

## Screen Purpose

Provide a role-aware workspace for recipes and costing while preserving company, brand, location/project, department, requester, status, approval and audit context.

Current release behavior shows recipe versions, ingredient lines, price basis, costing readiness, food-cost analysis, controlled draft recipe creation, controlled edit-by-new-version revision drafts with ingredient append/remove/reorder and link-only sub-recipe lines, a read-only revision workbook export for planning larger recipe changes, controlled archive, controlled recipe-version workflow actions, and controlled menu-price decision actions. Bulk import/apply and recursive sub-recipe costing remain gated by the approved implementation sequence.

## Implemented Screens or Views

1. List / queue view with search, filters, export and permission-aware actions
2. Detail view with recipe summary, version history, ingredient lines, costing
   readiness, menu-price basis, workflow actions, and audit/source context
3. Create draft recipe flow with validation, ingredient lines, and draft version creation
4. Create revision draft flow from an existing version, with editable yield, serving, target food cost, line quantities, prep notes, existing-line removal, appended scoped ingredients, appended published sub-recipe/prep links, line order values, and required reason
5. Controlled archive flow with required reason and open-version blocking
6. Recipe-version workflow and menu-price decision action surfaces when the role
   and status permit them
7. Read-only revision workbook export for large recipe planning
8. Restaurant Ops **Servings & Consumption** workspace with role-aware tabs for
   Serving Declarations, Review & Posting, and Branch Configuration; server
   filters, pagination, responsive declaration entry, independent verification,
   explicit expected-consumption posting/reversal, FEFO allocation detail and
   audit history
9. Exact-branch configuration with an operational read-only view for staff,
   supervisors and managers, plus permission-gated Admin controls for issue
   location, service-period version, company default schedule, high-shrink
   sentinel cohort, effective menu-recipe mappings, readiness validation and
   explicit activation

## Global UI Rules

- Use core Design Tokens, Component Library, Mobile Rules and UX State standards.
- Keep primary action labels explicit; avoid ambiguous universal actions.
- Show scope context in the header and preserve it across drill-downs.
- Use status pills with text, not color alone.
- Do not hide critical fields behind unnecessary tabs.
- Include empty, loading, error, permission-denied, rejected, cancelled and archived states.
- Use a single shared spacing token across page layout, cards, forms and table controls.

## Implemented Details

- Search/type/status filters and CSV export preserve list context.
- Draft creation validates recipe code, type, yield, serving, target food cost,
  and ingredient lines.
- Revision draft creation supports controlled source-version edits without
  mutating the published costing basis.
- Role-based actions are backed by server-side recipe and menu-price workflow
  permissions.
- Missing supplier price, UOM conversion, or actual-cost evidence is visible as
  pending evidence instead of guessed.
- Menu-price changes require a separate decision record and effective-dated
  price apply action.
- Recipe actions do not mutate inventory, POS sales, finance, or approval-source
  records.
- Serving fact create/edit/submit/verify actions do not mutate inventory. Only the
  separately permissioned **Post expected consumption** action writes dedicated
  `CONSUMPTION_OUT` ledger movements, atomically and exactly once.
- Paid and authorized complimentary servings are supported. Complimentary lines
  require a reason and operational reference. Staff meals and prepared-but-
  not-served failures are excluded from the serving form and remain separate
  controlled workflows.
- Recipe readiness failures retain the serving fact as `DERIVATION_BLOCKED` and
  show actionable blockers; no partial ingredient posting is allowed.
- Consumption exports and details use **Expected/Book Consumption**, never
  physical actual consumption. Physical counts remain the independent on-hand
  evidence.
- Brand menu items inherit an effective brand-default recipe. Explicit branch
  unavailability and location overrides remain controlled exceptions; quantity
  readiness and pending cost evidence are shown separately.
- Recipe ownership is selected from the user's live Company/Brand scope, not
  inferred from assigned branch locations. An active brand can therefore own
  recipes before its first branch is configured. Location remains optional
  price-preview and downstream operational context; it does not own a recipe.
- Staff and supervisors record servings from the declarations workspace. Managers
  use the separate Review & Posting queue only when their live verify/post
  permissions allow it. The Branch Configuration tab is readable as selected-
  branch operational context, while create/activate/adopt/override/cancel controls
  are absent without their dedicated live Admin permissions.

## Implemented Recipe Adoption Surface — `DEC-0280`

The controlled surface separates formula publication from operational adoption
and shows:

- one effective-dated brand-default published recipe per active brand `MenuItem`;
- explicit Company-shared recipe adoption by the selected brand;
- effective branch availability exclusions and exact-location recipe overrides;
- the deterministic resolved state: `Unavailable`, `Location override`,
  `Brand default`, or `Blocked`;
- a newly published version as a candidate only, with a separate controlled
  successor rollout for an already adopted menu item;
- quantity readiness separately from cost readiness, so pending cost evidence does
  not hide an otherwise valid formula/UOM/issue-location quantity path; and
- effective dates, actor, reason, branch impact/readiness preview, concurrency
  conflict, and audit history for each controlled action.

No publish, adopt, exclude, override, restore, or rollout action may post inventory.
Cross-brand selection and implicit Company/shared fallback are absent from the
catalog and rejected by the server. Local automated validation is complete;
named-role browser UAT and production activation remain pending.

## Future-Gated Details

- Bulk import/apply and mass recipe maintenance behavior.
- Recursive sub-recipe cost flattening and snapshot policy.
- Additional mobile shortcuts beyond the current responsive workflow surfaces.
- Any richer approval-panel behavior beyond the confirmed `DEC-0035` workflow
  actions.

## Acceptance Criteria

The UI is complete only when a first-time permitted user can identify the record, scope, status, next action, owner and material operational impact without leaving the record page.

For the current controlled slice, acceptance also requires that draft recipe creation, revision-draft creation with ingredient append/remove/reorder and link-only sub-recipe lines, archive, and recipe-version actions are permissioned and auditable, the revision workbook export is read-only and audited, menu-price changes require a separate decision record, and no visible action mutates inventory, POS sales, finance, or approval-source records. Future bulk import/apply and recursive sub-recipe costing acceptance must be defined before implementation.
