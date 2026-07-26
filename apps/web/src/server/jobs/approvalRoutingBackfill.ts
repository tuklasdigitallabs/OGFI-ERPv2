import {
  APPROVAL_ROUTING_SCHEMA_VERSION,
} from "../services/approvalRouting";
import {
  runApprovalRoutingBackfill,
  type BackfillOptions,
} from "../services/approvalRoutingBackfill";

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

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function deployedReleaseIdentity() {
  const value = requiredEnvironment("GITHUB_SHA");
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error("APPROVAL_ROUTING_BACKFILL_RELEASE_IDENTITY_INVALID");
  }
  return value;
}

const knownArguments = new Set(["--apply", "--dry-run", "--start", "--resume", "--stop"]);
const args = process.argv.slice(2);
if (args.some((value) => !knownArguments.has(value))) {
  throw new Error("APPROVAL_ROUTING_BACKFILL_ARGUMENT_INVALID");
}
const apply = args.includes("--apply");
if (apply === args.includes("--dry-run")) {
  throw new Error("APPROVAL_ROUTING_BACKFILL_MODE_REQUIRED");
}
const start = args.includes("--start");
const resume = args.includes("--resume");
const stop = args.includes("--stop");
if (apply && Number(start) + Number(resume) + Number(stop) !== 1) {
  throw new Error("APPROVAL_ROUTING_BACKFILL_OPERATION_REQUIRED");
}
if (!apply && (start || resume || stop)) {
  throw new Error("APPROVAL_ROUTING_BACKFILL_DRY_RUN_OPERATION_INVALID");
}

const baseOptions: BackfillOptions = {
  apply,
  batchSize: integerEnvironment("APPROVAL_ROUTING_BACKFILL_BATCH_SIZE", 50, 1, 100),
  maxSeconds: integerEnvironment("APPROVAL_ROUTING_BACKFILL_MAX_SECONDS", 40, 1, 50),
  leaseSeconds: integerEnvironment("APPROVAL_ROUTING_BACKFILL_LEASE_SECONDS", 90, 10, 600),
  tenantId: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_TENANT_ID"),
  companyId: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_COMPANY_ID"),
};

const options: BackfillOptions = apply
  ? {
      ...baseOptions,
      operation: start ? "START" : stop ? "STOP" : "RESUME",
      tenantId: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_TENANT_ID"),
      companyId: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_COMPANY_ID"),
      runId: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_RUN_ID"),
      requestId: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_REQUEST_ID"),
      leaseOwner: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_LEASE_OWNER"),
      operatorIdentity: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_OPERATOR_IDENTITY"),
      authorizationReference: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_AUTHORIZATION_REFERENCE"),
      ...(start
        ? { idempotencyKey: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_IDEMPOTENCY_KEY") }
        : {}),
      contract: {
        releaseIdentity: deployedReleaseIdentity(),
        expectedRoutingSchemaVersion: integerEnvironment(
          "APPROVAL_ROUTING_BACKFILL_EXPECTED_SCHEMA_VERSION",
          Number.NaN,
          APPROVAL_ROUTING_SCHEMA_VERSION,
          APPROVAL_ROUTING_SCHEMA_VERSION,
        ),
        expectedMappingVersion: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_EXPECTED_MAPPING_VERSION"),
        expectedMappingHash: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_EXPECTED_MAPPING_HASH"),
        expectedCapabilityVersion: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_EXPECTED_CAPABILITY_VERSION"),
        expectedCapabilityHash: requiredEnvironment("APPROVAL_ROUTING_BACKFILL_EXPECTED_CAPABILITY_HASH"),
      },
    }
  : baseOptions;

const result = await runApprovalRoutingBackfill(options);
console.log(JSON.stringify({ event: "approval_routing_backfill", ...result }));

const exitCodeByOutcome = {
  DRAIN_CLEAN: 0,
  CONTINUE: 2,
  BLOCKED: 3,
  RETRYABLE: 4,
  INCOMPATIBLE: 5,
  BARRIER_REQUIRED: 6,
  STOPPED: 0,
} as const;
process.exitCode = apply
  ? exitCodeByOutcome[result.outcome]
  : result.outcome === "BLOCKED"
    ? 3
    : result.hasMore
      ? 2
      : 0;
