INSERT INTO "Permission" ("id", "code", "module", "action")
VALUES
  (
    '00000000-0000-4000-8000-000000000114',
    'restaurant.branch_operations.create',
    'restaurant',
    'branch_operations.create'
  ),
  (
    '00000000-0000-4000-8000-000000000115',
    'restaurant.food_safety.create',
    'restaurant',
    'food_safety.create'
  )
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."code" IN (
    'restaurant.branch_operations.create',
    'restaurant.food_safety.create'
  )
WHERE r."code" IN ('CONFIGURED_ADMIN', 'CONFIGURED_REQUESTER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."code" = 'CONFIGURED_REQUESTER'
  AND p."code" IN (
    'restaurant.branch_operations.review',
    'restaurant.food_safety.review'
  );
