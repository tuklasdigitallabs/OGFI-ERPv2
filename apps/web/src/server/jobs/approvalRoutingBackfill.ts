import { runApprovalRoutingBackfill } from "../services/approvalRoutingBackfill";

function integerEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

const apply = process.argv.includes("--apply");
const unexpectedArguments = process.argv.slice(2).filter((value) => value !== "--apply");
if (unexpectedArguments.length > 0) {
  throw new Error("APPROVAL_ROUTING_BACKFILL_ARGUMENT_INVALID");
}

const result = await runApprovalRoutingBackfill({
  apply,
  batchSize: integerEnvironment("APPROVAL_ROUTING_BACKFILL_BATCH_SIZE", 50, 1, 100),
  maxSeconds: integerEnvironment("APPROVAL_ROUTING_BACKFILL_MAX_SECONDS", 40, 1, 50),
  ...(process.env.APPROVAL_ROUTING_BACKFILL_TENANT_ID
    ? { tenantId: process.env.APPROVAL_ROUTING_BACKFILL_TENANT_ID }
    : {}),
  ...(process.env.APPROVAL_ROUTING_BACKFILL_COMPANY_ID
    ? { companyId: process.env.APPROVAL_ROUTING_BACKFILL_COMPANY_ID }
    : {}),
});

console.log(JSON.stringify({ event: "approval_routing_backfill", ...result }));
if (result.blockers.length > 0 || result.hasMore) process.exitCode = 2;
