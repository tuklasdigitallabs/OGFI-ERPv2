import path from "node:path";

export const evidenceStorageProviders = [
  "hostinger-local",
  "local-private",
] as const;
export type EvidenceStorageProvider = (typeof evidenceStorageProviders)[number];

type CommonEvidenceStorageConfig = {
  production: boolean;
  uploadIntentTtlSeconds: number;
  uploadIntentAbsoluteTtlSeconds: number;
  uploadLeaseSeconds: number;
  maxActiveUploadIntentsPerUser: number;
  maxActiveUploadIntentsPerCompany: number;
  maxUploadIntentsPerUserHour: number;
  maxUploadIntentsPerCompanyHour: number;
  maxUploadBytes: number;
  defaultCompanyQuotaBytes: number;
};

export type EvidenceStorageConfig =
  | (CommonEvidenceStorageConfig & {
      provider: "hostinger-local";
      production: true;
      brokerUrl: string;
      brokerSharedSecretFile: string;
      brokerRequestTimeoutMs: number;
      reconciliationEnabled: true;
      reconciliationBatchSize: number;
      reconciliationIntervalSeconds: number;
      reconciliationLeaseSeconds: number;
      reconciliationMaxAttempts: number;
      pendingTimeoutMinutes: number;
      maximumSignatureAgeHours: number;
    })
  | (CommonEvidenceStorageConfig & {
      provider: "local-private";
      production: false;
      rootDirectory: string;
      localScanMode: "explicit-test-clean" | "quarantine-only";
    });

export class EvidenceStorageConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super("EVIDENCE_STORAGE_CONFIGURATION_INVALID");
    this.name = "EvidenceStorageConfigurationError";
    this.issues = [...new Set(issues)];
  }
}

export type EvidenceStorageEnvironment =
  | "PRODUCTION"
  | "STAGING"
  | "CONTROLLED_UAT"
  | "LOCAL_DEVELOPMENT";

type Environment = Record<string, string | undefined>;

function applicationEnvironment(env: Environment) {
  return env.APP_ENV?.trim().toLowerCase();
}

function isHostedEnvironment(env: Environment) {
  const value = applicationEnvironment(env);
  if (value === "production" || value === "staging") return true;
  if (value === "development" || value === "test" || value === "uat") {
    return false;
  }
  return env.NODE_ENV === "production";
}

export function classifyEvidenceStorageEnvironment(
  config: Pick<EvidenceStorageConfig, "production">,
  env: Environment = process.env,
): EvidenceStorageEnvironment {
  const value = applicationEnvironment(env);
  if (value === "production") return "PRODUCTION";
  if (value === "staging") return "STAGING";
  if (value === "uat" || value === "controlled-uat") {
    return "CONTROLLED_UAT";
  }
  if (value === "development" || value === "test") {
    return "LOCAL_DEVELOPMENT";
  }
  if (config.production) {
    throw new Error("EVIDENCE_STORAGE_ENVIRONMENT_UNCLASSIFIED");
  }
  return "LOCAL_DEVELOPMENT";
}

function required(env: Environment, name: string, issues: string[]) {
  const value = env[name]?.trim() ?? "";
  if (!value) issues.push(`${name}_MISSING`);
  return value;
}

function integer(
  env: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  issues: string[],
) {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    issues.push(`${name}_INVALID`);
  }
  return value;
}

function exactBoolean(
  env: Environment,
  name: string,
  requiredValue: boolean,
  issues: string[],
) {
  const raw = env[name]?.trim().toLowerCase();
  if (raw !== String(requiredValue)) issues.push(`${name}_INVALID`);
  return raw === "true";
}

function safeBrokerUrl(raw: string, issues: string[]) {
  try {
    const parsed = new URL(raw);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    ) {
      throw new Error("invalid");
    }
    if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
      throw new Error("loopback");
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    issues.push("EVIDENCE_BROKER_URL_INVALID");
    return raw;
  }
}

function commonConfiguration(
  env: Environment,
  hosted: boolean,
  issues: string[],
): CommonEvidenceStorageConfig {
  const uploadIntentTtlSeconds = integer(
    env,
    "EVIDENCE_UPLOAD_INTENT_TTL_SECONDS",
    300,
    60,
    900,
    issues,
  );
  const uploadLeaseSeconds = integer(
    env,
    "EVIDENCE_UPLOAD_LEASE_SECONDS",
    180,
    60,
    3_600,
    issues,
  );
  const uploadIntentAbsoluteTtlSeconds = integer(
    env,
    "EVIDENCE_UPLOAD_INTENT_ABSOLUTE_TTL_SECONDS",
    900,
    uploadIntentTtlSeconds,
    86_400,
    issues,
  );
  const maxActiveUploadIntentsPerUser = integer(
    env,
    "EVIDENCE_MAX_ACTIVE_UPLOAD_INTENTS_PER_USER",
    20,
    1,
    1_000,
    issues,
  );
  const maxActiveUploadIntentsPerCompany = integer(
    env,
    "EVIDENCE_MAX_ACTIVE_UPLOAD_INTENTS_PER_COMPANY",
    500,
    1,
    100_000,
    issues,
  );
  const maxUploadIntentsPerUserHour = integer(
    env,
    "EVIDENCE_MAX_UPLOAD_INTENTS_PER_USER_HOUR",
    100,
    1,
    100_000,
    issues,
  );
  const maxUploadIntentsPerCompanyHour = integer(
    env,
    "EVIDENCE_MAX_UPLOAD_INTENTS_PER_COMPANY_HOUR",
    2_000,
    1,
    1_000_000,
    issues,
  );
  if (maxActiveUploadIntentsPerCompany < maxActiveUploadIntentsPerUser) {
    issues.push("EVIDENCE_MAX_ACTIVE_UPLOAD_INTENTS_SCOPE_INVALID");
  }
  if (maxUploadIntentsPerCompanyHour < maxUploadIntentsPerUserHour) {
    issues.push("EVIDENCE_MAX_UPLOAD_INTENTS_RATE_SCOPE_INVALID");
  }
  const maxUploadBytes = integer(
    env,
    "EVIDENCE_MAX_UPLOAD_BYTES",
    26_214_400,
    1,
    26_214_400,
    issues,
  );
  if (hosted && !env.EVIDENCE_DEFAULT_COMPANY_QUOTA_BYTES?.trim()) {
    issues.push("EVIDENCE_DEFAULT_COMPANY_QUOTA_BYTES_MISSING");
  }
  const defaultCompanyQuotaBytes = integer(
    env,
    "EVIDENCE_DEFAULT_COMPANY_QUOTA_BYTES",
    hosted ? 0 : 1_073_741_824,
    1,
    Number.MAX_SAFE_INTEGER,
    issues,
  );
  if (defaultCompanyQuotaBytes < maxUploadBytes) {
    issues.push("EVIDENCE_DEFAULT_COMPANY_QUOTA_BYTES_TOO_SMALL");
  }
  return {
    production: hosted,
    uploadIntentTtlSeconds,
    uploadIntentAbsoluteTtlSeconds,
    uploadLeaseSeconds,
    maxActiveUploadIntentsPerUser,
    maxActiveUploadIntentsPerCompany,
    maxUploadIntentsPerUserHour,
    maxUploadIntentsPerCompanyHour,
    maxUploadBytes,
    defaultCompanyQuotaBytes,
  };
}

export function readEvidenceStorageConfig(
  env: Environment = process.env,
): EvidenceStorageConfig {
  const hosted = isHostedEnvironment(env);
  const issues: string[] = [];
  const provider = env.EVIDENCE_STORAGE_PROVIDER?.trim() as
    | EvidenceStorageProvider
    | undefined;
  if (!provider || !evidenceStorageProviders.includes(provider)) {
    issues.push("EVIDENCE_STORAGE_PROVIDER_INVALID");
  }
  if (hosted && provider !== "hostinger-local") {
    issues.push("EVIDENCE_STORAGE_PROVIDER_HOSTED_INVALID");
  }
  if (!hosted && provider === "hostinger-local") {
    issues.push("EVIDENCE_STORAGE_PROVIDER_LOCAL_INVALID");
  }
  const common = commonConfiguration(env, hosted, issues);

  if (provider === "local-private") {
    const configuredRoot = required(env, "EVIDENCE_LOCAL_STORAGE_ROOT", issues);
    const rootDirectory = configuredRoot
      ? path.resolve(configuredRoot)
      : configuredRoot;
    const localScanMode = env.EVIDENCE_LOCAL_SCAN_MODE?.trim();
    if (
      localScanMode !== "explicit-test-clean" &&
      localScanMode !== "quarantine-only"
    ) {
      issues.push("EVIDENCE_LOCAL_SCAN_MODE_INVALID");
    }
    if (issues.length > 0) throw new EvidenceStorageConfigurationError(issues);
    return {
      ...common,
      provider,
      production: false,
      rootDirectory,
      localScanMode: localScanMode as
        | "explicit-test-clean"
        | "quarantine-only",
    };
  }

  const brokerUrl = safeBrokerUrl(
    required(env, "EVIDENCE_BROKER_URL", issues),
    issues,
  );
  if (hosted && brokerUrl !== "http://evidence-broker:3010") {
    issues.push("EVIDENCE_BROKER_URL_HOSTED_BOUNDARY_INVALID");
  }
  const brokerSharedSecretFile = required(
    env,
    "EVIDENCE_BROKER_SHARED_SECRET_FILE",
    issues,
  );
  if (brokerSharedSecretFile && !path.isAbsolute(brokerSharedSecretFile)) {
    issues.push("EVIDENCE_BROKER_SHARED_SECRET_FILE_NOT_ABSOLUTE");
  }
  const brokerRequestTimeoutMs = integer(
    env,
    "EVIDENCE_BROKER_REQUEST_TIMEOUT_MS",
    10_000,
    1_000,
    30_000,
    issues,
  );
  const reconciliationEnabled = exactBoolean(
    env,
    "EVIDENCE_SCAN_RECONCILIATION_ENABLED",
    true,
    issues,
  );
  const reconciliationBatchSize = integer(
    env,
    "EVIDENCE_SCAN_RECONCILIATION_BATCH_SIZE",
    50,
    1,
    500,
    issues,
  );
  const reconciliationIntervalSeconds = integer(
    env,
    "EVIDENCE_SCAN_RECONCILIATION_INTERVAL_SECONDS",
    60,
    15,
    3600,
    issues,
  );
  const reconciliationLeaseSeconds = integer(
    env,
    "EVIDENCE_SCAN_RECONCILIATION_LEASE_SECONDS",
    45,
    15,
    900,
    issues,
  );
  if (reconciliationLeaseSeconds >= reconciliationIntervalSeconds) {
    issues.push("EVIDENCE_SCAN_RECONCILIATION_LEASE_INTERVAL_INVALID");
  }
  const reconciliationMaxAttempts = integer(
    env,
    "EVIDENCE_SCAN_RECONCILIATION_MAX_ATTEMPTS",
    10,
    1,
    100,
    issues,
  );
  const pendingTimeoutMinutes = integer(
    env,
    "EVIDENCE_SCAN_PENDING_TIMEOUT_MINUTES",
    60,
    5,
    1440,
    issues,
  );
  const maximumSignatureAgeHours = integer(
    env,
    "EVIDENCE_SCAN_SIGNATURE_MAX_AGE_HOURS",
    24,
    1,
    168,
    issues,
  );
  for (const name of [
    "EVIDENCE_BROKER_REQUEST_TIMEOUT_MS",
    "EVIDENCE_SCAN_RECONCILIATION_BATCH_SIZE",
    "EVIDENCE_SCAN_RECONCILIATION_INTERVAL_SECONDS",
    "EVIDENCE_SCAN_RECONCILIATION_LEASE_SECONDS",
    "EVIDENCE_SCAN_RECONCILIATION_MAX_ATTEMPTS",
    "EVIDENCE_SCAN_PENDING_TIMEOUT_MINUTES",
    "EVIDENCE_SCAN_SIGNATURE_MAX_AGE_HOURS",
    "EVIDENCE_UPLOAD_INTENT_TTL_SECONDS",
    "EVIDENCE_UPLOAD_INTENT_ABSOLUTE_TTL_SECONDS",
    "EVIDENCE_UPLOAD_LEASE_SECONDS",
    "EVIDENCE_MAX_ACTIVE_UPLOAD_INTENTS_PER_USER",
    "EVIDENCE_MAX_ACTIVE_UPLOAD_INTENTS_PER_COMPANY",
    "EVIDENCE_MAX_UPLOAD_INTENTS_PER_USER_HOUR",
    "EVIDENCE_MAX_UPLOAD_INTENTS_PER_COMPANY_HOUR",
    "EVIDENCE_MAX_UPLOAD_BYTES",
    "EVIDENCE_DEFAULT_COMPANY_QUOTA_BYTES",
  ]) {
    if (!env[name]?.trim()) issues.push(`${name}_MISSING`);
  }
  if (issues.length > 0) throw new EvidenceStorageConfigurationError(issues);
  return {
    ...common,
    provider: "hostinger-local",
    production: true,
    brokerUrl,
    brokerSharedSecretFile,
    brokerRequestTimeoutMs,
    reconciliationEnabled: reconciliationEnabled as true,
    reconciliationBatchSize,
    reconciliationIntervalSeconds,
    reconciliationLeaseSeconds,
    reconciliationMaxAttempts,
    pendingTimeoutMinutes,
    maximumSignatureAgeHours,
  };
}

export function assertProductionEvidenceStorageConfiguration(
  env: Environment = process.env,
) {
  if (isHostedEnvironment(env)) readEvidenceStorageConfig(env);
}

export function getEvidenceStorageStaticReadiness(
  env: Environment = process.env,
) {
  try {
    const config = readEvidenceStorageConfig(env);
    return {
      status: "ok" as const,
      providerClass:
        config.provider === "hostinger-local"
          ? ("private-vps-storage" as const)
          : ("local-development-storage" as const),
      productionSafe: config.provider === "hostinger-local",
      issues: [] as string[],
    };
  } catch (error) {
    return {
      status: "degraded" as const,
      providerClass: "unavailable" as const,
      productionSafe: false,
      issues:
        error instanceof EvidenceStorageConfigurationError
          ? [...error.issues]
          : ["EVIDENCE_STORAGE_CONFIGURATION_INVALID"],
    };
  }
}
