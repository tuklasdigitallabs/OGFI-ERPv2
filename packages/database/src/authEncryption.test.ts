import { afterEach, describe, expect, it, vi } from "vitest";
import { rotateAuthenticationEncryption } from "./authEncryption";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authentication encryption rotation configuration", () => {
  it("rejects malformed and out-of-range batch sizes before database work", async () => {
    vi.stubEnv("APP_ENCRYPTION_KEY", Buffer.alloc(32, 2).toString("base64"));
    vi.stubEnv("APP_ENCRYPTION_KEY_VERSION", "2");
    vi.stubEnv(
      "APP_ENCRYPTION_PREVIOUS_KEY",
      Buffer.alloc(32, 1).toString("base64"),
    );
    vi.stubEnv("APP_ENCRYPTION_PREVIOUS_KEY_VERSION", "1");

    await expect(
      rotateAuthenticationEncryption({ batchSize: Number.NaN }),
    ).rejects.toThrow("AUTH_ENCRYPTION_ROTATION_BATCH_SIZE_INVALID");
    await expect(
      rotateAuthenticationEncryption({ batchSize: 0 }),
    ).rejects.toThrow("AUTH_ENCRYPTION_ROTATION_BATCH_SIZE_INVALID");
    await expect(
      rotateAuthenticationEncryption({ batchSize: 501 }),
    ).rejects.toThrow("AUTH_ENCRYPTION_ROTATION_BATCH_SIZE_INVALID");
  });
});
