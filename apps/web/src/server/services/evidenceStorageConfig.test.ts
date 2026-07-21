import { describe, expect, it } from "vitest";
import {
  EvidenceStorageConfigurationError,
  assertProductionEvidenceStorageConfiguration,
  classifyEvidenceStorageEnvironment,
  getEvidenceStorageStaticReadiness,
  readEvidenceStorageConfig,
} from "./evidenceStorageConfig";

function productionEnvironment(): NodeJS.ProcessEnv {
  return {
    APP_ENV: "production",
    NODE_ENV: "production",
    EVIDENCE_STORAGE_PROVIDER: "hostinger-local",
    EVIDENCE_BROKER_URL: "http://evidence-broker:3010",
    EVIDENCE_BROKER_SHARED_SECRET_FILE:
      "/run/secrets/evidence_broker_shared_secret",
    EVIDENCE_BROKER_REQUEST_TIMEOUT_MS: "10000",
    EVIDENCE_SCAN_RECONCILIATION_ENABLED: "true",
    EVIDENCE_SCAN_RECONCILIATION_BATCH_SIZE: "50",
    EVIDENCE_SCAN_RECONCILIATION_INTERVAL_SECONDS: "60",
    EVIDENCE_SCAN_RECONCILIATION_LEASE_SECONDS: "45",
    EVIDENCE_SCAN_RECONCILIATION_MAX_ATTEMPTS: "10",
    EVIDENCE_SCAN_PENDING_TIMEOUT_MINUTES: "60",
    EVIDENCE_SCAN_SIGNATURE_MAX_AGE_HOURS: "24",
    EVIDENCE_UPLOAD_INTENT_TTL_SECONDS: "300",
    EVIDENCE_UPLOAD_INTENT_ABSOLUTE_TTL_SECONDS: "900",
    EVIDENCE_UPLOAD_LEASE_SECONDS: "180",
    EVIDENCE_MAX_ACTIVE_UPLOAD_INTENTS_PER_USER: "20",
    EVIDENCE_MAX_ACTIVE_UPLOAD_INTENTS_PER_COMPANY: "500",
    EVIDENCE_MAX_UPLOAD_INTENTS_PER_USER_HOUR: "100",
    EVIDENCE_MAX_UPLOAD_INTENTS_PER_COMPANY_HOUR: "2000",
    EVIDENCE_MAX_UPLOAD_BYTES: "26214400",
    EVIDENCE_DEFAULT_COMPANY_QUOTA_BYTES: "10737418240",
  };
}

function issueCodes(env: NodeJS.ProcessEnv) {
  try {
    readEvidenceStorageConfig(env);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(EvidenceStorageConfigurationError);
    return (error as EvidenceStorageConfigurationError).issues;
  }
}

describe("controlled evidence storage configuration", () => {
  it("accepts the production Hostinger broker without returning secrets", () => {
    const config = readEvidenceStorageConfig(productionEnvironment());
    expect(config).toMatchObject({
      provider: "hostinger-local",
      production: true,
      brokerUrl: "http://evidence-broker:3010",
    });
    expect(JSON.stringify(config)).not.toContain("shared-secret-value");
    expect(getEvidenceStorageStaticReadiness(productionEnvironment())).toEqual({
      status: "ok",
      providerClass: "private-vps-storage",
      productionSafe: true,
      issues: [],
    });
  });

  it("fails hosted environments closed for development storage", () => {
    const env: NodeJS.ProcessEnv = {
      ...productionEnvironment(),
      EVIDENCE_STORAGE_PROVIDER: "local-private",
      EVIDENCE_LOCAL_STORAGE_ROOT: ".local/evidence",
      EVIDENCE_LOCAL_SCAN_MODE: "explicit-test-clean",
    };
    expect(issueCodes(env)).toContain("EVIDENCE_STORAGE_PROVIDER_HOSTED_INVALID");
  });

  it.each([
    ["EVIDENCE_BROKER_URL", "", "EVIDENCE_BROKER_URL_MISSING"],
    [
      "EVIDENCE_BROKER_SHARED_SECRET_FILE",
      "",
      "EVIDENCE_BROKER_SHARED_SECRET_FILE_MISSING",
    ],
    [
      "EVIDENCE_SCAN_RECONCILIATION_ENABLED",
      "false",
      "EVIDENCE_SCAN_RECONCILIATION_ENABLED_INVALID",
    ],
    [
      "EVIDENCE_SCAN_SIGNATURE_MAX_AGE_HOURS",
      "",
      "EVIDENCE_SCAN_SIGNATURE_MAX_AGE_HOURS_MISSING",
    ],
    [
      "EVIDENCE_DEFAULT_COMPANY_QUOTA_BYTES",
      "",
      "EVIDENCE_DEFAULT_COMPANY_QUOTA_BYTES_MISSING",
    ],
  ])("rejects invalid required production setting %s", (name, value, issue) => {
    const env = productionEnvironment();
    env[name] = value;
    expect(issueCodes(env)).toContain(issue);
  });

  it("requires an internal absolute-secret-file broker configuration", () => {
    const env = productionEnvironment();
    env.EVIDENCE_BROKER_URL = "http://localhost:4070/path?secret=value";
    env.EVIDENCE_BROKER_SHARED_SECRET_FILE = "relative/secret";
    expect(issueCodes(env)).toEqual(
      expect.arrayContaining([
        "EVIDENCE_BROKER_URL_INVALID",
        "EVIDENCE_BROKER_SHARED_SECRET_FILE_NOT_ABSOLUTE",
      ]),
    );
  });

  it("never sends the hosted broker credential to an external host", () => {
    const env = productionEnvironment();
    env.EVIDENCE_BROKER_URL = "https://storage.example.com";
    expect(issueCodes(env)).toContain(
      "EVIDENCE_BROKER_URL_HOSTED_BOUNDARY_INVALID",
    );
  });

  it("requires a lease shorter than the reconciliation interval", () => {
    const env = productionEnvironment();
    env.EVIDENCE_SCAN_RECONCILIATION_LEASE_SECONDS = "60";
    expect(issueCodes(env)).toContain(
      "EVIDENCE_SCAN_RECONCILIATION_LEASE_INTERVAL_INVALID",
    );
  });

  it("allows explicit development storage only outside hosted environments", () => {
    const config = readEvidenceStorageConfig({
      APP_ENV: "development",
      NODE_ENV: "test",
      EVIDENCE_STORAGE_PROVIDER: "local-private",
      EVIDENCE_LOCAL_STORAGE_ROOT: ".local/private-evidence",
      EVIDENCE_LOCAL_SCAN_MODE: "quarantine-only",
    });
    expect(config).toMatchObject({
      provider: "local-private",
      production: false,
      localScanMode: "quarantine-only",
      defaultCompanyQuotaBytes: 1_073_741_824,
    });
  });

  it("allows the explicit controlled-UAT waiver under a production Next runtime", () => {
    const config = readEvidenceStorageConfig({
      APP_ENV: "uat",
      NODE_ENV: "production",
      EVIDENCE_STORAGE_PROVIDER: "local-private",
      EVIDENCE_LOCAL_STORAGE_ROOT: ".local/uat-private-evidence",
      EVIDENCE_LOCAL_SCAN_MODE: "explicit-test-clean",
      EVIDENCE_DEFAULT_COMPANY_QUOTA_BYTES: "1073741824",
    });
    expect(config).toMatchObject({ provider: "local-private", production: false });
    expect(classifyEvidenceStorageEnvironment(config, { APP_ENV: "uat" })).toBe(
      "CONTROLLED_UAT",
    );
  });

  it("requires the Hostinger provider for staging", () => {
    const env: NodeJS.ProcessEnv = {
      APP_ENV: "staging",
      NODE_ENV: "test",
      EVIDENCE_STORAGE_PROVIDER: "local-private",
      EVIDENCE_LOCAL_STORAGE_ROOT: ".local/staging-private-evidence",
      EVIDENCE_LOCAL_SCAN_MODE: "explicit-test-clean",
    };
    expect(issueCodes(env)).toContain("EVIDENCE_STORAGE_PROVIDER_HOSTED_INVALID");
  });

  it("rejects a default company quota below the per-object limit", () => {
    const env = productionEnvironment();
    env.EVIDENCE_DEFAULT_COMPANY_QUOTA_BYTES = "1024";
    expect(issueCodes(env)).toContain(
      "EVIDENCE_DEFAULT_COMPANY_QUOTA_BYTES_TOO_SMALL",
    );
  });

  it("rejects uploads configured above the bounded platform cap", () => {
    const env = productionEnvironment();
    env.EVIDENCE_MAX_UPLOAD_BYTES = "26214401";
    expect(issueCodes(env)).toContain("EVIDENCE_MAX_UPLOAD_BYTES_INVALID");
  });

  it("asserts storage configuration during hosted startup only", () => {
    expect(() =>
      assertProductionEvidenceStorageConfiguration({
        APP_ENV: "development",
        NODE_ENV: "test",
      }),
    ).not.toThrow();
    expect(() =>
      assertProductionEvidenceStorageConfiguration({
        APP_ENV: "production",
        NODE_ENV: "production",
      }),
    ).toThrow("EVIDENCE_STORAGE_CONFIGURATION_INVALID");
  });
});
