# DEC-0280 — Brand-Default Recipe Adoption and Branch Resolution

## Metadata

- Decision ID: `DEC-0280`
- Title: Brand-Default Recipe Adoption and Branch Resolution
- Status: `Confirmed`
- Implementation state: `Implemented and locally verified; named-role browser UAT and production activation remain pending`
- Date: 2026-08-11
- Decision owner: OGFI Product Owner / Operations and Recipe Owners
- Decision Chair: Parent agent
- Related phase/module: Phase II Recipes, Menu Items, and expected consumption
- Related decisions: `DEC-0035`, `DEC-0041`, `DEC-0049`, `DEC-0279`
- Related decision brief: Parent-confirmed recipe-adoption and branch-resolution decision

## Decision

A published `RecipeVersion` is an approved formula, not an automatic menu-item or
inventory assignment. An active brand `MenuItem` adopts one effective-dated
brand-default published `RecipeVersion`; every active `BRANCH` location of that
brand inherits the default unless an effective branch availability exclusion or
exact-location recipe override applies.

Resolution is deterministic and fail-closed:

```text
UNAVAILABLE > LOCATION_OVERRIDE > BRAND_DEFAULT > BLOCKED
```

A Company-shared recipe requires explicit adoption by each brand. Cross-brand
adoption, inheritance, override, or fallback is prohibited. Publishing a new
version creates a candidate only; it does not replace an adoption automatically.
Only an already adopted menu item may receive a controlled, effective-dated
successor rollout. Pending cost evidence does not block quantity readiness when
the approved formula, ingredient/UOM path, issue location, and stock readiness are
otherwise valid. Publication, adoption, exclusions, overrides, and rollout create
no inventory movement.

## Context

`DEC-0279` requires one effective published formula before a verified serving can
derive expected ingredient quantity. The existing local exact-branch assignment
shape does not establish the confirmed product rule for shared brand menus: it can
duplicate ordinary defaults across branches, silently omit a new branch, or permit
an unsafe arbitrary fallback. Recipe publication also cannot mean automatic
operational adoption because a new approved formula may need a future rollout date
and branch-specific readiness review.

The selected hierarchy gives the brand one ordinary formula while retaining
auditable branch exceptions. It separates formula approval, operational adoption,
availability, costing evidence, and inventory posting.

## Options considered

### Option A — selected: brand default with explicit branch exceptions

- **Summary:** Adopt a published formula at brand/menu-item scope and inherit it
  across active branches, subject to effective unavailability and exact-location
  overrides.
- **Benefits:** Minimizes duplicate configuration, onboards new active branches
  predictably, preserves necessary local exceptions, and provides one deterministic
  resolution order.
- **Failure modes:** Overlapping effective rows, a cross-brand version, an override
  to an unpublished formula, automatic successor adoption, or ignoring an
  unavailability exclusion could derive the wrong ingredient demand.
- **Why selected:** It matches brand-owned menus while preserving exact branch
  control and fail-closed consumption readiness.

### Option B — rejected: independent assignment for every branch

- **Summary:** Maintain one menu-item/recipe assignment per location, including
  ordinary branches with no variation.
- **Benefits:** Every branch relationship is explicit.
- **Failure modes:** Configuration duplication and drift, incomplete rollout to a
  new branch, inconsistent ordinary formulas, and unsafe arbitrary-first fallback.
- **Why rejected:** It makes the exception shape the default and weakens consistent
  brand operations.

### Option C — rejected: publication automatically replaces every assignment

- **Summary:** Treat the latest published version as effective immediately for all
  menu items and branches.
- **Benefits:** No separate adoption or rollout action.
- **Failure modes:** Unreviewed formula changes affect expected consumption, branch
  readiness and historical interpretation; there is no controlled effective date
  or rollback boundary.
- **Why rejected:** Publication approves a candidate formula; it does not authorize
  operational rollout.

### Option D — rejected: cross-brand or Company-wide implicit fallback

- **Summary:** Resolve a similarly named or Company-shared recipe without explicit
  brand adoption.
- **Benefits:** Less configuration for shared concepts.
- **Failure modes:** Brand ownership and formula intent become ambiguous, and a
  serving can consume the wrong ingredients.
- **Why rejected:** Cross-brand resolution must fail closed; shared formulas require
  affirmative brand adoption.

## Hard-gate assessment

1. **Tenant/company/brand/location isolation:** Adoption is bound to the exact
   tenant, Company, brand, and `MenuItem`. A branch exception is bound to an exact
   active `BRANCH` location of that brand. Cross-brand resolution returns blocked.
2. **Server authorization:** Publish, adopt, exclude/restore, override/remove,
   and successor-rollout actions are separate controlled server commands with live
   scope, exact permission, and fresh privileged-MFA checks. Adoption requires
   `restaurant.menu_recipe.adopt`; branch availability actions require
   `restaurant.menu_recipe.branch_exception`; an exact-location recipe override
   requires both `restaurant.menu_recipe.branch_exception` and
   `restaurant.menu_recipe.adopt` plus live Brand/Company `MANAGE`; controlled
   successor rollout requires both `restaurant.menu_recipe.rollout` and
   `restaurant.recipe.publish`. No role title, generic Admin
   permission, recipe publication permission, consumption configuration permission,
   or UI visibility grants these authorities.
3. **Immutable history and audit:** Effective-dated adoption and exception rows are
   superseded, not overwritten. Actor, reason, decision time, effective range, and
   source-version lineage remain auditable.
4. **Transaction consistency:** Effective ranges cannot overlap for the same
   resolution key. Activation and successor rollout use concurrency/idempotency
   guards and resolve one outcome at the serving business time.
5. **Inventory integrity:** Formula publication and mapping actions create zero
   inventory movements. Only the separate verified `DEC-0279` post command may
   create `CONSUMPTION_OUT`.
6. **Recovery:** A future-effective adoption/exception may be cancelled before it
   starts; an effective mistake is corrected with a new effective-dated successor.
   Historical serving snapshots retain the recipe actually resolved.
7. **Activation boundary:** The brand-default hierarchy is implemented locally,
   but `DEC-0279` branch activation remains blocked until named-role browser UAT
   and the production release gates pass for the exact candidate.

## Required safeguards

- A recipe version must be `PUBLISHED`, active for the resolution time, and owned
  by the same brand as the `MenuItem`, unless it is explicitly Company-shared and
  the target brand has adopted it.
- A brand-default adoption applies only to active `MenuItem` records of that exact
  brand. New or reactivated branches inherit only when they are active, type
  `BRANCH`, and otherwise ready under `DEC-0279`.
- An effective branch unavailability row wins over every override/default and
  prevents declaration selection and posting for that menu item at that branch.
- An exact-location override wins over the brand default but never bypasses
  publication, brand adoption, ingredient/UOM, issue-location, or stock readiness.
- Absence of a valid default or override resolves `BLOCKED`; no arbitrary recipe,
  latest-version, same-name, other-brand, other-location, or first-row fallback is
  permitted.
- Publishing a successor creates a candidate. A controlled rollout requires an
  existing effective adoption for the menu item, explicit target successor,
  effective time, actor/reason, concurrency guard, and readiness preview. It may
  not create adoption for an unadopted menu item.
- Quantity readiness depends on the approved formula and valid ingredient/UOM,
  inventory-item, issue-location, and stock path. Missing supplier price or other
  pending cost evidence is shown separately and must not block quantity derivation.
- Serving verification snapshots the resolved adoption/default-or-override source,
  recipe version, effective time, and resolution evidence. Later rollout does not
  rewrite that snapshot.
- Tests must cover all four resolution outcomes, effective-boundary ties,
  overlapping-row rejection, inactive/non-branch locations, unavailable-over-
  override precedence, cross-brand and shared-without-adoption denial, unpublished
  versions, concurrent successor rollout, new-branch inheritance, pending-cost
  quantity readiness, and zero inventory effect from every mapping action.

## Implementation and documentation impact

- **Code / architecture:** Add one server-owned resolver used by declaration entry,
  verification, readiness, preview, and reporting. Remove any authoritative
  arbitrary-first or exact-branch-only fallback before activation.
- **Data / schema:** Add effective-dated brand-default adoption, exact-location
  availability/override exceptions, explicit Company-shared brand adoption, and
  controlled successor-rollout lineage with non-overlap and scope constraints.
- **Workflow / permissions:** Treat publication, adoption, branch exception, and
  successor rollout as separate actions. The three new permissions are sensitive,
  require fresh privileged MFA, and are not recommended or seeded to generic
  Requester, Approver, or Admin roles. The local/UAT System Super User receives all
  seeded permissions for controlled test setup only. Existing recipe publish,
  consumption configure, or generic Admin authority does not imply them.
- **UI / mobile:** Show the resolved source (`Unavailable`, `Location override`,
  `Brand default`, or `Blocked`), effective dates, candidate successor, branch
  exceptions, readiness, and audit history. No mapping action implies inventory
  posting.
- **Reporting:** Report the pinned resolved recipe and source for historical
  serving/consumption rows; distinguish quantity readiness from cost readiness.
- **Knowledge base / training:** Dunong must update recipe publication/adoption,
  branch exception, successor rollout, and blocked-resolution guidance before user
  exposure.
- **Tests / UAT:** Schema, resolver, authorization, idempotency, PostgreSQL
  integration, permission-manifest, typecheck, lint, production build, migration,
  seed, and zero-inventory-effect checks pass locally. Responsive named-role
  browser UAT and hosted release evidence remain pending; this record provides no
  production-activation credit.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Design additive adoption/exception/rollout schema and migration from current exact-branch assignments without rewriting history. | Database / Architecture | Before implementation | Complete locally |
| Define separate live permissions and action policy for adoption, branch exceptions, and successor rollout. | Product / Security / Operations | Before implementation | Confirmed: `restaurant.menu_recipe.adopt`, `restaurant.menu_recipe.branch_exception`, and `restaurant.menu_recipe.rollout`; all sensitive and fresh-MFA guarded. |
| Implement the shared resolver and replace current activation/readiness dependencies. | Backend / Frontend | After schema and authority review | Complete locally |
| Execute data-integrity, authorization, concurrency, browser, and named-role UAT evidence. | QA / Security / Operations | Before activation | Automated local evidence complete; named-role browser UAT pending |
| Prepare user-facing adoption and rollout guidance. | Dunong | Before user exposure | Complete locally; validate during UAT |

## Evidence

- [`AGENTS.md`](../../../../AGENTS.md) — scope isolation, server authorization,
  immutable history, configurable policy, and inventory-ledger controls.
- [`DEC-0279-MANUAL-SERVINGS-CONTROLLED-INVENTORY-CONSUMPTION.md`](DEC-0279-MANUAL-SERVINGS-CONTROLLED-INVENTORY-CONSUMPTION.md) — consumption readiness and posting boundary.
- [`recipes-costing-ui-spec.md`](../../../phases/phase-02-restaurant-operations-and-food-cost/specs/recipes-costing-ui-spec.md) — recipe and costing workspace behavior.
- [`theoretical-vs-actual-food-cost-workflow.md`](../../../phases/phase-02-restaurant-operations-and-food-cost/workflows/theoretical-vs-actual-food-cost-workflow.md) — serving resolution and expected-consumption workflow.
- Authorized human confirmation supplied to the parent agent on 2026-08-11.

## Supersession

This record supersedes only the exact-branch `MenuRecipeAssignment` target and any
implied latest-published, arbitrary-first, same-name, cross-brand, or automatic
publication fallback in `DEC-0279` and related specifications. It does not
supersede recipe approval/publication history, branch menu availability, serving
facts, recipe snapshots, controlled consumption posting, FEFO, reversal, physical
counts, or expected/book-consumption interpretation.
