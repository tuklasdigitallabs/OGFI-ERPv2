-- Keep baseline stock-adjustment reasons usable from the static dropdown.
-- Specific type restrictions remain available through custom admin-created codes.

UPDATE "OperationalReasonCode"
SET "appliesTo" = NULL
WHERE "workflow" = 'STOCK_ADJUSTMENT'
  AND "code" IN (
    'SYSTEM_CORRECTION',
    'SYSTEM_CORRECTION_DECREASE',
    'COUNT_CORRECTION',
    'COUNT_CORRECTION_DECREASE',
    'UOM_CONVERSION_FIX',
    'LOT_EXPIRY_CORRECTION'
  );

UPDATE "OperationalReasonCode"
SET "appliesTo" = 'OPENING_BALANCE'
WHERE "workflow" = 'STOCK_ADJUSTMENT'
  AND "code" = 'OPENING_BALANCE';
