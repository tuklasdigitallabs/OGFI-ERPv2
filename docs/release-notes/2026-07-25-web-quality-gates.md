# Web quality gates restored

The web lint and TypeScript gates are green after removing obsolete client overflow state left behind by the bounded Purchase Request lookup migration. No user workflow policy changed.

User Access now limits assigned-role and effective-permission reads to the Overview and Roles sections. Other sections show an unavailable marker for those summaries, while role Requests retains only the identifiers needed by its assignment catalog.

The Roles section now uses one selected-role action composer with preserved search/page context and a required reason, replacing repeated deactivation forms in each row.

Scope navigation and deactivation now preserve the Scopes tab, filters, and page context through search, paging, and action redirects.

Admin Settings now uses one selected-policy composer for Configure and Use Recommended actions, preserving registry context and keeping policy mutation/audit validation server-authoritative.

Release Readiness UAT evidence review now uses one focused review sheet for Verify/Reject actions, with explicit status consequences and preserved filter/page context.

Deployment Evidence review now uses the same focused Verify/Reject sheet, with migration/restore/monitoring readiness consequences and preserved registry context.

UAT evidence capture now uses a workspace TaskSheet with mobile-safe controls and preserved filter/page context instead of a long centered modal.

Enablement evidence review now uses a focused TaskSheet with explicit training, knowledge-base, and release-note readiness consequences and visible rejection-reason validation.

Readiness gate updates now use one selected-gate TaskSheet with preserved register context and the existing server-enforced status, evidence, blocker, reason, authorization, and audit controls.

Deployment and Enablement evidence capture now uses the same mobile-safe TaskSheet pattern as UAT, preserving active filters and page context on save and validation errors.

Release Board decision creation is now canonicalized to the dedicated Release Board workspace; the Readiness register no longer exposes a duplicate GO/NO-GO composer.

Release Board history now supports bounded inclusive UTC decision-date filters with preserved search, paging, selected-detail, and composer context.

Core Administration now uses compact URL-backed workspace tabs and active-tab reads; inactive registers and option catalogs are not loaded in the current view.

Item Master now uses the same compact URL-backed tabs and active-tab reads. The
selected register loads only its required records, counts, selected context,
and catalogs; existing company authorization and mutation controls remain
server-authoritative.

Supplier catalog item-link deactivation now uses one selected-record TaskSheet
with preserved supplier/catalog filters and page context. Repeated row modals
were removed; the existing scoped, reasoned, audited mutation remains the
authority.

Selected Supplier work is now split into URL-backed Overview, Catalog,
Accreditation, and Audit sections. Catalog-only reads prevent inactive tabs
from hydrating item links; Audit is a read-only handoff to bounded Admin Audit
until a supplier-specific projection is approved.

Supplier Audit handoff now reaches the real Admin Audit workspace and applies
an exact selected-entity filter through paging, export, and event detail. The
existing redacted, read-only audit authority remains unchanged.
