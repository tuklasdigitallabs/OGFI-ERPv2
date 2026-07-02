-- Phase I bridge from PR draft lines to item/UOM master data.
-- Fields are nullable so existing free-text request lines remain valid.

ALTER TABLE "PurchaseRequestLine"
  ADD COLUMN "itemId" UUID REFERENCES "Item"("id"),
  ADD COLUMN "uomId" UUID REFERENCES "Uom"("id");

CREATE INDEX "PurchaseRequestLine_itemId_idx"
  ON "PurchaseRequestLine"("itemId");

CREATE INDEX "PurchaseRequestLine_uomId_idx"
  ON "PurchaseRequestLine"("uomId");
