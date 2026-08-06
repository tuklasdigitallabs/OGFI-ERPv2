import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const check = readFileSync(new URL("./pilot-readiness-check.mjs", import.meta.url), "utf8");
const preflight = readFileSync(new URL("./pilot-readiness-preflight.mjs", import.meta.url), "utf8");

test("Inventory Control readiness profile is explicit and preserves combined readiness", () => {
  assert.match(check, /new Set\(\["combined", "inventory_control"\]\)/);
  assert.match(check, /const inventoryControlProfile = readinessProfile === "inventory_control"/);
  assert.match(check, /DEFERRED \\| \$\{check\.label\}/);
  assert.match(check, /Phase 1\.5 Projects & Implementation Tracker \(no pilot credit\)/);
  assert.match(check, /const projectTrackerChecks = inventoryControlProfile/);
  assert.match(check, /const profilePermissionCodes = inventoryControlProfile/);
  assert.match(check, /const sensitivePermissionPredicate = inventoryControlProfile/);
});

test("pilot readiness preflight rejects unknown profiles", () => {
  assert.match(preflight, /new Set\(\["combined", "inventory_control"\]\)/);
  assert.match(preflight, /pilot readiness profile allowlisted/);
});
