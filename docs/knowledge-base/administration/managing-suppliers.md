# Managing Suppliers

The Supplier Register is company-scoped master data. Core Administrators with active management scope for the selected company can search supplier code or name and filter lifecycle and accreditation status. Results are server-paginated and the total reflects all matching suppliers.

Supplier accreditation, deactivation, and supplier-item links remain reasoned, audited actions. A supplier preview shows only a bounded catalog summary; use the selected supplier catalog workspace for the full paginated item-link register.

Supplier-item creation is available from a selected active supplier's catalog. Search and page through active item and purchase-UOM lookups before entering supplier terms, price, and a reason. The selected supplier is the only record affected; company scope and active-record checks are enforced again when the link is submitted. If a lookup page is no longer available, the list returns to its last valid page.

Select a supplier and choose Open controls to update accreditation or deactivate an active supplier. The action composer identifies the selected record; inactive suppliers show retained history instead of mutation controls.

The register is still under production-readiness review for focused action composers and external database/browser evidence.

In a supplier catalog, choose Open controls on an active item link to open the
single deactivation action sheet. Confirm the item and purchase UOM, enter a
reason of at least five characters, and submit. The current filters and page
are preserved; if the link is stale, inactive, or outside the selected company,
the sheet explains that no action is available. Deactivation retains history
and does not change purchase orders or inventory.
