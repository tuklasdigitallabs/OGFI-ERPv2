INSERT INTO "Permission" ("id", "code", "module", "action")
VALUES
  (gen_random_uuid(), 'finance.supplier_credit.submit', 'finance', 'supplier_credit.submit')
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON (
    r."code" = 'CONFIGURED_ADMIN'
    AND p."code" IN ('finance.supplier_credit.submit')
  )
  OR (
    r."code" = 'CONFIGURED_REQUESTER'
    AND p."code" IN ('finance.supplier_credit.submit')
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
