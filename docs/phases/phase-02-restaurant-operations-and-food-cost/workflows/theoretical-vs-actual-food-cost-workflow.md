# OGFI ERP — Phase II Workflow: Theoretical vs Actual Food Cost

**Status:** Current read/report/export slice and default-off `DEC-0279` manual consumption workflow implemented locally; branch activation and UAT pending
**Purpose:** Compare sales-driven theoretical ingredient usage to controlled inventory evidence without mislabeling expected/book consumption as physical actual usage.

## Business Outcome

Define a controlled, role-aware, auditable workflow that follows OGFI core scope, approvals, audit, notification, security and Modern SaaS design standards.

## Primary Roles

- Requester / operational user
- Responsible manager or department owner
- Required approver(s)
- Finance / compliance / quality reviewer where applicable
- Administrator or auditor with read-only oversight

## Current Implementation Boundary

Theoretical-vs-actual food-cost views may:

- read posted restaurant sales import batches and lines for the selected company, brand, location, and business date;
- derive theoretical cost from linked menu items and published recipe/menu-cost basis;
- summarize actual cost from posted outbound inventory-ledger evidence only;
- show row health counts for within-target, above-target, missing-cost, and awaiting-actuals rows;
- preserve selected filters in drilldowns and CSV exports.

Theoretical-vs-actual views must not:

- import or mutate POS/sales records in the current slice;
- post or reverse inventory movements;
- allocate branch-level actual cost to menu items without a controlled production or consumption source;
- approve, close, or mutate recipe, menu-price, finance, purchasing, or inventory source records.

## Implemented Restaurant Ops Workflow — Default-Off

`DEC-0279` confirms and the local application implements the following additive
workflow under Restaurant Ops. It is not active, UAT-approved, or
production-authorized until an exact branch configuration passes readiness:

1. An encoder submits an immutable serving declaration for one authoritative
   configured, non-overlapping service period and business date.
2. A different manager verifies the factual declaration. A small branch uses an
   exactly scoped remote Area or Operations manager; self-verification is not an
   exception path.
3. A non-encoder manager invokes a separate explicit `Post Consumption` command.
   The same manager may verify and post only through separate actions while holding
   both live permissions, exact live scope, and current MFA.
4. The server resolves the effective published recipe through `DEC-0280`, then
   resolves yield, sub-recipes, UOM conversions and rounding, configured issue
   location, and deterministic FEFO lot/expiry allocation.
5. The whole verified document posts atomically and exactly once through dedicated
   `CONSUMPTION_OUT` movements. Missing or ambiguous readiness, insufficient stock,
   or a count/cutoff conflict blocks the whole post and creates zero movements while
   preserving the declaration.
6. A posted error is corrected through full-document reversal followed by a linked
   corrected replacement; no in-place ledger or fact rewrite is allowed.

### Authoritative period rule

Each company/location/effective-date scope uses one configured period source:

- configured service periods with a read-only daily rollup; or
- `DAILY` as the sole capture and posting period.

Both must never be accepted as posting sources for the same time coverage.

The product supports every active branch, while each branch remains default-off
until its exact inventory issue location and readiness are configured. Company
defaults provide effective-dated service periods and timezone; audited branch
overrides are allowed without weakening the no-overlap rule. The declaration
catalog shows all active, approved menu items offered at the selected branch, but
posting remains all-or-zero when any selected item lacks its effective recipe,
UOM path, inventory mapping, issue location, or eligible stock.

### Confirmed recipe-adoption resolution — pending implementation

`DEC-0280` supersedes the current exact-branch assignment shape as the activation
target. A published recipe version is an approved formula only. An active brand
`MenuItem` must explicitly adopt an effective-dated brand-default published
`RecipeVersion`, inherited by each active `BRANCH` location of that brand except
where an effective exact-branch rule applies. Resolution is:

```text
UNAVAILABLE > LOCATION_OVERRIDE > BRAND_DEFAULT > BLOCKED
```

Company-shared formulas require explicit adoption by each brand. Cross-brand,
latest-published, same-name, arbitrary-location, and arbitrary-first-row fallbacks
fail closed. A new publication is a candidate; only a menu item with an existing
adoption may receive a controlled effective-dated successor rollout. Pending cost
evidence does not block quantity readiness, but formula publication, recipe scope,
ingredient/UOM, inventory-item, issue-location, and eligible-stock readiness still
must pass before posting. Publication and every mapping action create zero inventory
movement. `DEC-0279` branch activation remains blocked until this hierarchy is
implemented, migrated without rewriting historical snapshots, and verified.

### Exclusive inventory-effect ownership

| Fact | Controlled inventory effect |
|---|---|
| Paid or complimentary menu item prepared and issued/served | Recipe-derived Consumption; complimentary also requires reason, authorizer, and equivalent controlled approval/evidence |
| Staff meal | Separate Authorized Consumption; excluded from menu servings |
| Cancelled before preparation | No movement |
| Prepared but not served/issued | Wastage |
| Served then refunded | Consumption remains posted |
| Remake | Original is Wastage; issued replacement is Consumption |
| Physical count difference | Count variance/correction, never duplicate Consumption |

Branch Staff and Branch Supervisors may encode within their exact branch scope.
Branch Managers verify and post through separate commands and permissions; the
encoder cannot verify or post their own declaration. A remote Admin, Area, or
Operations reviewer must be specifically assigned the branch scope and operational
permission with MFA; platform administration alone grants no posting authority.

A complimentary serving is an approved menu item prepared and served without
payment. It consumes inventory once with zero revenue and requires its reason or
category, manager authorization, and the applicable operational reference or
notes. Configurable value, repeat, or bulk thresholds may require elevated review.
It must not also be classified as Wastage or Authorized Consumption. Staff meals
remain outside menu-serving declarations under OGFI's confirmed process.

### Count and reporting interpretation

The pilot default is blind closing counts daily for a bounded configured set of
high-shrink sentinel items, weekly for other configured high-risk/perishable items,
and monthly for general inventory. Cadence review requires at least four weeks and
sufficient evidence; it never relaxes automatically. Count freeze/cutoff and
controlled late-post rules prevent consumption from silently crossing a count
boundary.

Sentinel items are an explicitly configured item/category/location cohort selected
for high value, shrink exposure, ease of removal, perishability, or repeated
variance. The application may recommend candidates from usage and variance data,
but it must not hardcode or automatically enroll them.

Recipe-derived ledger use must be labeled `Expected/Book Consumption`. Physical
counts and controlled variance/correction evidence remain authoritative for
observed actual stock and loss investigation. Neither expected consumption nor a
variance alone proves theft or loss.

## Non-Negotiable Controls

- No user may act outside assigned scope.
- Important actions require a timestamped audit event.
- Approval, financial, compliance or inventory-impacting actions must not be silently overwritten.
- Free-text comments do not replace structured fields, reason codes or evidence where those are required.
- Core document and security rules override this framework if a conflict exists.

## Remaining Decisions

The POS import write workflow, trusted source qualification, source-precedence
cutover, and any menu-level allocation of physical actual cost remain governed by
`II-004`, `DEC-0279`, and future approved decision records. A future trusted POS
source may replace manual fact capture, but it must reuse or explicitly supersede
the controlled posting, disposition-ownership, idempotency, and audit contract.
