INSERT INTO "Permission" ("id", "code", "module", "action")
VALUES
  (
    '00000000-0000-4000-8000-000000000126',
    'finance.view',
    'finance',
    'view'
  ),
  (
    '00000000-0000-4000-8000-000000000127',
    'finance.configure',
    'finance',
    'configure'
  ),
  (
    '00000000-0000-4000-8000-000000000128',
    'finance.ledger.view',
    'finance',
    'ledger.view'
  ),
  (
    '00000000-0000-4000-8000-000000000129',
    'finance.payables.view',
    'finance',
    'payables.view'
  ),
  (
    '00000000-0000-4000-8000-000000000130',
    'finance.payment_request.create',
    'finance',
    'payment_request.create'
  ),
  (
    '00000000-0000-4000-8000-000000000131',
    'finance.payment_request.approve',
    'finance',
    'payment_request.approve'
  ),
  (
    '00000000-0000-4000-8000-000000000132',
    'finance.payment.release',
    'finance',
    'payment.release'
  ),
  (
    '00000000-0000-4000-8000-000000000133',
    'finance.reconciliation.view',
    'finance',
    'reconciliation.view'
  ),
  (
    '00000000-0000-4000-8000-000000000134',
    'finance.period_close.manage',
    'finance',
    'period_close.manage'
  )
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON (
    r."code" = 'CONFIGURED_ADMIN'
    AND p."code" IN (
      'finance.view',
      'finance.configure',
      'finance.ledger.view',
      'finance.payables.view',
      'finance.payment_request.create',
      'finance.payment_request.approve',
      'finance.payment.release',
      'finance.reconciliation.view',
      'finance.period_close.manage'
    )
  )
  OR (
    r."code" = 'CONFIGURED_APPROVER'
    AND p."code" IN (
      'finance.view',
      'finance.payables.view',
      'finance.payment_request.approve'
    )
  )
  OR (
    r."code" = 'CONFIGURED_REQUESTER'
    AND p."code" = 'finance.view'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
