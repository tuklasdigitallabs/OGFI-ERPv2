import { describe, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  assertLocalUatDatabaseAdmission,
  isLocalUatDatabaseAdmissionRequired,
  localUatDatabaseAdmissionErrors,
  type LocalUatDatabaseIdentityProbe,
} from "./localUatDatabaseAdmission";

const expectedEnvironment = {
  OGFI_LOCAL_UAT_BASELINE_REQUIRED: "true",
  OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME: "ogfi_rehearsal_local_aug10",
  OGFI_DISPOSABLE_DATABASE_RUN_ID:
    "ogfi_rehearsal_local_aug10-1723276800000",
  OGFI_DISPOSABLE_DATABASE_NONCE_SHA256: "a".repeat(64),
};

function probeWith(rows: unknown) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(rows),
  } as unknown as LocalUatDatabaseIdentityProbe;
}

function matchingMarker() {
  return {
    currentDatabase: expectedEnvironment.OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME,
    databaseName: expectedEnvironment.OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME,
    runId: expectedEnvironment.OGFI_DISPOSABLE_DATABASE_RUN_ID,
    nonceSha256: expectedEnvironment.OGFI_DISPOSABLE_DATABASE_NONCE_SHA256,
    constructionTokenSha256: null,
  };
}

describe("Local-UAT database admission", () => {
  test("is enabled only by the exact explicit admission flag", () => {
    expect(isLocalUatDatabaseAdmissionRequired({})).toBe(false);
    expect(
      isLocalUatDatabaseAdmissionRequired({
        OGFI_LOCAL_UAT_BASELINE_REQUIRED: "false",
      }),
    ).toBe(false);
    expect(
      isLocalUatDatabaseAdmissionRequired({
        OGFI_LOCAL_UAT_BASELINE_REQUIRED: "TRUE",
      }),
    ).toBe(false);
    expect(
      isLocalUatDatabaseAdmissionRequired({
        OGFI_LOCAL_UAT_BASELINE_REQUIRED: "true",
      }),
    ).toBe(true);
  });

  test("does not query a database when Local-UAT admission is disabled", async () => {
    const database = probeWith([matchingMarker()]);
    await expect(assertLocalUatDatabaseAdmission({}, database)).resolves.toBe(
      false,
    );
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });

  test("accepts one exact restricted-function marker from the runtime connection", async () => {
    const database = probeWith([matchingMarker()]);
    await expect(
      assertLocalUatDatabaseAdmission(expectedEnvironment, database),
    ).resolves.toBe(true);

    const query = vi.mocked(database.$queryRaw).mock.calls[0]?.[0] as unknown as
      | TemplateStringsArray
      | undefined;
    expect(query?.join("?")).toContain(
      "ogfi_disposable_control.verify_database_identity()",
    );
    expect(query?.join("?")).toContain("current_database()");
  });

  test("accepts a pending marker only with the exact construction token digest", async () => {
    const constructionToken = "b".repeat(43);
    const constructionTokenSha256 = createHash("sha256")
      .update(constructionToken)
      .digest("hex");
    const environment = {
      ...expectedEnvironment,
      OGFI_LOCAL_UAT_CONSTRUCTION_TOKEN: constructionToken,
      OGFI_LOCAL_UAT_CONSTRUCTION_TOKEN_SHA256: constructionTokenSha256,
    };
    const database = probeWith([
      {
        ...matchingMarker(),
        runId: `${expectedEnvironment.OGFI_DISPOSABLE_DATABASE_RUN_ID}.pending`,
        constructionTokenSha256,
      },
    ]);
    await expect(
      assertLocalUatDatabaseAdmission(environment, database),
    ).resolves.toBe(true);
    const query = vi.mocked(database.$queryRaw).mock.calls[0]?.[0] as unknown as
      | TemplateStringsArray
      | undefined;
    expect(query?.join("?")).toContain(
      "ogfi_disposable_control.verify_database_construction_identity()",
    );
  });

  test("rejects incomplete, invalid, and mismatched construction credentials", async () => {
    const database = probeWith([matchingMarker()]);
    await expect(
      assertLocalUatDatabaseAdmission(
        { ...expectedEnvironment, OGFI_LOCAL_UAT_CONSTRUCTION_TOKEN: "b".repeat(43) },
        database,
      ),
    ).rejects.toThrow(
      localUatDatabaseAdmissionErrors.constructionTokenInvalid,
    );
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });

  test.each([
    [
      "missing expected database",
      { ...expectedEnvironment, OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME: "" },
      localUatDatabaseAdmissionErrors.expectedDatabaseMissing,
    ],
    [
      "unsafe expected database",
      {
        ...expectedEnvironment,
        OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME: "ogfi_erp",
      },
      localUatDatabaseAdmissionErrors.expectedDatabaseInvalid,
    ],
    [
      "unsafe expected run identifier",
      { ...expectedEnvironment, OGFI_DISPOSABLE_DATABASE_RUN_ID: "run id" },
      localUatDatabaseAdmissionErrors.expectedRunIdInvalid,
    ],
    [
      "unsafe expected nonce digest",
      {
        ...expectedEnvironment,
        OGFI_DISPOSABLE_DATABASE_NONCE_SHA256: "A".repeat(64),
      },
      localUatDatabaseAdmissionErrors.expectedNonceSha256Invalid,
    ],
  ])(
    "fails closed before querying for %s",
    async (
      _caseName: string,
      env: Record<string, string>,
      error: string,
    ) => {
      const database = probeWith([matchingMarker()]);
      await expect(
        assertLocalUatDatabaseAdmission(env, database),
      ).rejects.toThrow(error);
      expect(database.$queryRaw).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["current database", { currentDatabase: "ogfi_rehearsal_local_other" }],
    ["marker database", { databaseName: "ogfi_rehearsal_local_other" }],
    ["run identifier", { runId: "ogfi_rehearsal_local_aug10-1723276800001" }],
    ["nonce digest", { nonceSha256: "b".repeat(64) }],
  ])(
    "fails closed for a mismatched %s",
    async (
      _caseName: string,
      override: Partial<ReturnType<typeof matchingMarker>>,
    ) => {
      const database = probeWith([{ ...matchingMarker(), ...override }]);
      await expect(
        assertLocalUatDatabaseAdmission(expectedEnvironment, database),
      ).rejects.toThrow(localUatDatabaseAdmissionErrors.markerMismatch);
    },
  );

  test("rejects malformed, missing, ambiguous, and unreadable database markers without exposing values", async () => {
    const malformed = probeWith([
      { ...matchingMarker(), nonceSha256: "not-a-sha256-digest" },
    ]);
    await expect(
      assertLocalUatDatabaseAdmission(expectedEnvironment, malformed),
    ).rejects.toThrow(localUatDatabaseAdmissionErrors.markerInvalid);

    const missing = probeWith([]);
    await expect(
      assertLocalUatDatabaseAdmission(expectedEnvironment, missing),
    ).rejects.toThrow(
      localUatDatabaseAdmissionErrors.markerMissingOrAmbiguous,
    );

    const ambiguous = probeWith([matchingMarker(), matchingMarker()]);
    await expect(
      assertLocalUatDatabaseAdmission(expectedEnvironment, ambiguous),
    ).rejects.toThrow(
      localUatDatabaseAdmissionErrors.markerMissingOrAmbiguous,
    );

    const unreadable = {
      $queryRaw: vi.fn().mockRejectedValue(new Error("database password=secret")),
    } as unknown as LocalUatDatabaseIdentityProbe;
    const result = assertLocalUatDatabaseAdmission(
      expectedEnvironment,
      unreadable,
    );
    await expect(result).rejects.toThrow(
      localUatDatabaseAdmissionErrors.markerUnreadable,
    );
    await expect(result).rejects.not.toThrow("database password=secret");
  });
});
