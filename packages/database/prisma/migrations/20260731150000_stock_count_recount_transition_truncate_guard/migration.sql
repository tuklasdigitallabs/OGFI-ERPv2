-- Keep the recount-transition append-only guard effective for every destructive
-- statement shape, including TRUNCATE. The original foundation migration
-- predates the shared role-contract requirement for truncate protection.
DROP TRIGGER IF EXISTS "StockCountRecountTransition_append_only_guard_trg"
  ON "StockCountRecountTransition";

CREATE TRIGGER "StockCountRecountTransition_append_only_guard_trg"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "StockCountRecountTransition"
  FOR EACH STATEMENT
  EXECUTE FUNCTION "guard_stock_count_recount_transition_append_only"();

ALTER TABLE "StockCountRecountTransition"
  ENABLE ALWAYS TRIGGER "StockCountRecountTransition_append_only_guard_trg";
