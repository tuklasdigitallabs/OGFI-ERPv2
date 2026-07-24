# Managing the Item Master

The Item Master is governed company setup data for inventory and purchasing. Core Administrators with active management scope for the selected company can search items by code, name, or category and filter by lifecycle status. Results are server-paginated; the count reflects all matching company records, not only the visible page.

Changing an item requires a reason and does not rewrite historical transactions or post inventory. Use the controlled receiving, transfer, count, wastage, or adjustment workflows for stock effects.

Categories, UOMs, and conversion setup are separate tabs. Their bounded-read and option-catalog improvements remain under implementation review; do not treat the Item Master page as evidence that the full Master Data workspace is production-ready.

Conversion records are company-scoped through their item and both UOM relationships. The system rejects cross-company or inactive master-data relationships and requires distinct UOMs with a positive factor.

All four tabs use server-backed filters and pagination. Item create/edit selectors use a bounded server-side lookup and creation is disabled when valid choices exceed the catalog bound. Conversion creation may remain unavailable while its full option migration and focused action composer are completed.

Select an item and choose Open controls to edit or deactivate it. The selected-item composer preserves the current search and page context. If an item has posted inventory history, its base UOM cannot be changed through normal editing; a controlled migration is required. Conversion creation uses bounded active item/UOM selectors and is disabled only when those catalogs overflow.
