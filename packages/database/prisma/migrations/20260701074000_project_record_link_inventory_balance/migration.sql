ALTER TABLE "ProjectRecordLink"
  DROP CONSTRAINT "ProjectRecordLink_source_type_check";

ALTER TABLE "ProjectRecordLink"
  ADD CONSTRAINT "ProjectRecordLink_source_type_check"
    CHECK ("sourceRecordType" IN (
      'PURCHASE_REQUEST',
      'PURCHASE_ORDER',
      'GOODS_RECEIPT',
      'INVENTORY_TRANSFER',
      'SUPPLIER',
      'INVENTORY_MOVEMENT',
      'INVENTORY_BALANCE',
      'APPROVAL_INSTANCE',
      'WASTAGE_REPORT',
      'STOCK_ADJUSTMENT'
    ));
