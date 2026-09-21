# Decision brief — Location-aware low-stock thresholds

- **Question:** How should Phase I monitor low stock for One Gourmet Main Warehouse and SM North EDSA?
- **Why now:** Inventory balances are location-scoped, but the implementation has no reorder threshold model or low-stock dashboard alert. The requested pilot needs an actionable out-of-stock prevention signal.
- **Selected bounded option:** Configure a nonnegative threshold per active item and inventory location, aggregate recorded on-hand across that location's lot rows, and expose a live, paginated dashboard alert/read model. Equality is low stock. A configured item with no balance row is recorded as zero and clearly labeled as needing inventory initialization/reconciliation.
- **Scope:** Phase I inventory, master data, dashboard and existing controlled Request Stock workflow. Main Warehouse and SM North EDSA may have different thresholds.
- **Explicit limits:** The measure is recorded on-hand because reservations, quarantine and in-transit availability are not modeled. Do not call it available-to-dispatch. Do not create PRs/POs automatically. Preserve warehouse-first transfer/PR routing. Do not write persistent notifications from dashboard reads.
- **Hard gates:** tenant/company/location authorization; blind-count suppression across alert membership, counts, rows and exports; immutable ledger; audited threshold changes with stale-write protection; no fabricated defaults; no new stock movement when configuring or viewing a threshold.
- **Required evidence:** schema migration, service/UI configuration checks, dashboard/list/export parity, lot aggregation, equality/zero/no-row cases, scope and blind-count denials, threshold concurrency, and replenishment routing regression.
- **Decision owner:** Parent implementation agent; formal record steward: Mithi.
