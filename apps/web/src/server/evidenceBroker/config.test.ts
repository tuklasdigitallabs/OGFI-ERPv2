import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EvidenceBrokerConfigurationError,
  readEvidenceBrokerConfig,
} from "./config";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function validEnvironment() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogfi-broker-config-"));
  roots.push(root);
  await chmod(root, 0o700);
  const storageRoot = path.join(root, "evidence");
  await import("node:fs/promises").then(({ mkdir }) =>
    mkdir(storageRoot, { mode: 0o700 }),
  );
  const secretFile = path.join(root, "broker-secret");
  const keysFile = path.join(root, "broker-keys.json");
  await writeFile(secretFile, "x".repeat(48), { mode: 0o600 });
  await writeFile(
    keysFile,
    JSON.stringify({
      activeKeyId: "evidence-v1",
      keys: { "evidence-v1": randomBytes(32).toString("base64") },
    }),
    { mode: 0o600 },
  );
  return {
    EVIDENCE_BROKER_STORAGE_ROOT: storageRoot,
    EVIDENCE_BROKER_SHARED_SECRET_FILE: secretFile,
    EVIDENCE_BROKER_KEYS_FILE: keysFile,
  };
}

describe("evidence broker configuration", () => {
  it("loads separate bounded secret files and a versioned AES keyring", async () => {
    const config = await readEvidenceBrokerConfig(await validEnvironment());
    expect(config.activeKeyId).toBe("evidence-v1");
    expect(config.encryptionKeys.get("evidence-v1")).toHaveLength(32);
    expect(JSON.stringify(config)).not.toContain("evidence-v1\":");
  });

  it("fails closed when authentication and encryption use the same file", async () => {
    const env = await validEnvironment();
    env.EVIDENCE_BROKER_KEYS_FILE = env.EVIDENCE_BROKER_SHARED_SECRET_FILE;
    await expect(readEvidenceBrokerConfig(env)).rejects.toMatchObject({
      name: "EvidenceBrokerConfigurationError",
      issueCodes: expect.arrayContaining([
        "EVIDENCE_BROKER_SECRET_FILES_NOT_SEPARATE",
        "EVIDENCE_BROKER_KEYS_INVALID",
      ]),
    } satisfies Partial<EvidenceBrokerConfigurationError>);
  });

  it("rejects inline and file secret sources used together", async () => {
    const env = await validEnvironment();
    await expect(
      readEvidenceBrokerConfig({
        ...env,
        EVIDENCE_BROKER_SHARED_SECRET: "y".repeat(48),
      }),
    ).rejects.toMatchObject({
      issueCodes: expect.arrayContaining([
        "EVIDENCE_BROKER_SHARED_SECRET_SOURCE_INVALID",
      ]),
    });
  });
});
