INSERT INTO "Permission" ("id", "code", "module", "action")
VALUES (
  '00000000-0000-4000-8000-000000000097',
  'inventory.transfer.discrepancy.settle',
  'inventory',
  'transfer.discrepancy.settle'
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."code" = 'inventory.transfer.discrepancy.settle'
WHERE r."code" IN ('CONFIGURED_ADMIN', 'CONFIGURED_APPROVER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
