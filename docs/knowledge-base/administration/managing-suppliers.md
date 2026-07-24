# Managing Suppliers

The Supplier Register is company-scoped master data. Core Administrators with active management scope for the selected company can search supplier code or name and filter lifecycle and accreditation status. Results are server-paginated and the total reflects all matching suppliers.

Supplier accreditation, deactivation, and supplier-item links remain reasoned, audited actions. A supplier preview shows only a bounded catalog summary; use the selected supplier catalog workspace for the full paginated item-link register.

The global `Link Supplier Item` composer is temporarily unavailable while its supplier, item, and purchase-UOM selectors are migrated to bounded searchable lookups. This is an intentional disabled state; it does not bypass scope checks or expose an unbounded catalog. The selected supplier catalog remains the authoritative read-only review surface until the lookup migration is complete.

Select a supplier and choose Open controls to update accreditation or deactivate an active supplier. The action composer identifies the selected record; inactive suppliers show retained history instead of mutation controls.

The register is still under production-readiness review for focused action composers and external database/browser evidence.
