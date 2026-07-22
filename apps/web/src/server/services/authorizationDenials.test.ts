import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import {
  authorizationDenialActions,
  authorizationDenialReasons,
  authorizationDenialResources,
  recordAuthorizationDenial,
  recordDeniedDecisionInTransactionSafely,
  recordDeniedDecisionSafely,
  recordSessionDeniedDecisionInTransactionSafely,
  recordSessionDeniedDecisionSafely
} from "./authorizationDenials";
import { validateAuthorizationDenialWindowMinutes } from "./policySettings";

const baseInput = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  companyId: null,
  locationId: null,
  actorUserId: null,
  subjectType: "ANONYMOUS" as const,
  action: "AUTHENTICATE" as const,
  reason: "AUTHENTICATION_REQUIRED" as const,
  resource: "AUTHENTICATION" as const,
  windowMinutes: 15
};

function transactionMock(queryResults: unknown[] = []) {
  return {
    $queryRaw: vi.fn().mockImplementation(() => Promise.resolve(queryResults.shift() ?? [])),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
    companyPolicySetting: { findUnique: vi.fn() }
  };
}

describe("DEC-0050 authorization denial contract", () => {
  test("keeps dimensions closed and validates the 5-60 minute policy", () => {
    expect(authorizationDenialActions).not.toContain("TARGET_ID");
    expect(authorizationDenialReasons).not.toContain("ERROR_TEXT");
    expect(authorizationDenialResources).not.toContain("REQUEST_PATH");
    expect(validateAuthorizationDenialWindowMinutes(5)).toBe(5);
    expect(validateAuthorizationDenialWindowMinutes(15)).toBe(15);
    expect(validateAuthorizationDenialWindowMinutes(60)).toBe(60);
    for (const invalid of [4, 61, 5.5, "15", null]) {
      expect(() => validateAuthorizationDenialWindowMinutes(invalid)).toThrow(
        "AUTHORIZATION_DENIAL_WINDOW_MINUTES_INVALID"
      );
    }
  });

  test("treats the validated policy window as a bounded bucket dimension", () => {
    const source = readFileSync(
      new URL("./authorizationDenials.ts", import.meta.url),
      "utf8"
    );
    const keySlice = source.slice(
      source.indexOf("function safeBucketKey"),
      source.indexOf("function windowBounds")
    );
    expect(keySlice).toContain("input.windowMinutes");
  });

  test("rejects actor/scope shapes before opening a transaction", async () => {
    const transaction = vi.fn();
    await expect(recordAuthorizationDenial(
      { ...baseInput, subjectType: "ACTOR", actorUserId: null },
      { client: { $transaction: transaction } as never }
    )).rejects.toThrow();
    await expect(recordAuthorizationDenial(
      { ...baseInput, locationId: "22222222-2222-4222-8222-222222222222" },
      { client: { $transaction: transaction } as never }
    )).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });

  test("surfaces persistence failure without converting a denial into an allow result", async () => {
    const log = { error: vi.fn() };
    const result = await recordDeniedDecisionSafely(baseInput, {
      client: { $transaction: vi.fn().mockRejectedValue(new Error("database unavailable")) } as never,
      log
    });
    expect(result).toEqual({
      recorded: false,
      errorCode: "AUTHORIZATION_DENIAL_PERSISTENCE_FAILED"
    });
    expect(log.error).toHaveBeenCalledWith(
      "AUTHORIZATION_DENIAL_PERSISTENCE_FAILED",
      expect.objectContaining({
        event: "authorization_denial_persistence",
        code: "AUTHORIZATION_DENIAL_PERSISTENCE_FAILED",
        resource: "AUTHENTICATION",
        action: "AUTHENTICATE",
      }),
    );
    const detail = log.error.mock.calls[0]?.[1];
    expect(detail).not.toHaveProperty("tenantId");
    expect(detail).not.toHaveProperty("companyId");
    expect(detail).not.toHaveProperty("path");
    expect(detail).not.toHaveProperty("error");
    expect(result).not.toHaveProperty("allowed");
  });

  test("bounds high-volume persistence-failure logs by closed resource and action dimensions", async () => {
    const log = { error: vi.fn() };
    const transaction = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const client = {
      $transaction: transaction,
    } as never;
    const input = { ...baseInput, action: "EXPORT" as const };

    await Promise.all(
      Array.from({ length: 5_000 }, () =>
        recordDeniedDecisionSafely(input, { client, log })
      )
    );

    expect(log.error).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledTimes(5_000);
    const serialized = JSON.stringify(log.error.mock.calls);
    expect(serialized).not.toContain(baseInput.tenantId);
    expect(serialized).not.toContain("database unavailable");
  });

  test("keeps policy lookup failures inside the safe denial-recording boundary", async () => {
    const log = { error: vi.fn() };
    const transaction = vi.fn();
    const result = await recordSessionDeniedDecisionSafely(
      {
        user: { id: "33333333-3333-4333-8333-333333333333" },
        context: {
          tenantId: baseInput.tenantId,
          companyId: null,
          locationId: null
        }
      } as never,
      {
        action: "READ",
        reason: "PERMISSION_MISSING",
        resource: "REPORTING"
      },
      {
        client: { $transaction: transaction } as never,
        log,
        resolveWindowMinutes: vi.fn().mockRejectedValue(new Error("policy unavailable"))
      }
    );

    expect(result).toEqual({
      recorded: false,
      errorCode: "AUTHORIZATION_DENIAL_PERSISTENCE_FAILED"
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(
      "AUTHORIZATION_DENIAL_PERSISTENCE_FAILED",
      expect.objectContaining({ resource: "REPORTING", action: "READ" })
    );
    const serialized = JSON.stringify(log.error.mock.calls);
    expect(serialized).not.toContain(baseInput.tenantId);
    expect(serialized).not.toContain("policy unavailable");
  });

  test("bounds and redacts high-volume session-policy persistence failures", async () => {
    const log = { error: vi.fn() };
    const session = {
      user: { id: "55555555-5555-4555-8555-555555555555" },
      context: {
        tenantId: "66666666-6666-4666-8666-666666666666",
        companyId: "77777777-7777-4777-8777-777777777777",
        locationId: null,
      },
    } as never;
    await Promise.all(
      Array.from({ length: 5_000 }, () =>
        recordSessionDeniedDecisionSafely(
          session,
          {
            action: "ADMINISTER",
            reason: "PERMISSION_MISSING",
            resource: "ADMINISTRATION",
          },
          {
            log,
            resolveWindowMinutes: vi
              .fn()
              .mockRejectedValue(new Error("sensitive database failure")),
          },
        ),
      ),
    );
    expect(log.error).toHaveBeenCalledOnce();
    const serialized = JSON.stringify(log.error.mock.calls);
    expect(serialized).not.toContain("66666666-6666-4666-8666-666666666666");
    expect(serialized).not.toContain("77777777-7777-4777-8777-777777777777");
    expect(serialized).not.toContain("sensitive database failure");
  });

  test("uses the caller transaction directly and releases its savepoint after a repeated denial", async () => {
    const bucketId = "44444444-4444-4444-8444-444444444444";
    const tx = transactionMock([
      [],
      [],
      [{ id: bucketId, denialCount: 1n }],
      [{ id: bucketId, denialCount: 2n }]
    ]);

    const result = await recordDeniedDecisionInTransactionSafely(baseInput, {
      client: tx as never,
      now: new Date("2026-07-22T00:01:00.000Z")
    });

    expect(result).toEqual(expect.objectContaining({
      recorded: true,
      result: expect.objectContaining({ bucketId, count: 2n, created: false })
    }));
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      "SAVEPOINT authorization_denial_persistence"
    );
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      "RELEASE SAVEPOINT authorization_denial_persistence"
    );
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx).not.toHaveProperty("$transaction");
  });

  test("links first-denial audit evidence to the exact initial count", async () => {
    const tx = transactionMock([[], [], []]);
    await recordDeniedDecisionInTransactionSafely(baseInput, {
      client: tx as never,
      now: new Date("2026-07-22T00:01:00.000Z")
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "authorization.denial.first",
        metadata: expect.objectContaining({ count: "1" })
      })
    });
  });

  test("rolls back a failed PostgreSQL denial statement before caller work continues", async () => {
    let transactionAborted = false;
    const controlledEvidence = vi.fn(async () => {
      if (transactionAborted) throw new Error("current transaction is aborted");
      return { id: "controlled-state" };
    });
    const tx = transactionMock();
    tx.$queryRaw.mockImplementationOnce(async () => {
      transactionAborted = true;
      throw new Error("forced denial write failure");
    });
    tx.$executeRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql === "ROLLBACK TO SAVEPOINT authorization_denial_persistence") {
        transactionAborted = false;
      }
      return 0;
    });

    const result = await recordDeniedDecisionInTransactionSafely(baseInput, {
      client: tx as never,
      log: { error: vi.fn() }
    });
    const evidence = await controlledEvidence();

    expect(result).toEqual({
      recorded: false,
      errorCode: "AUTHORIZATION_DENIAL_PERSISTENCE_FAILED"
    });
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      "ROLLBACK TO SAVEPOINT authorization_denial_persistence"
    );
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      3,
      "RELEASE SAVEPOINT authorization_denial_persistence"
    );
    expect(evidence).toEqual({ id: "controlled-state" });
    expect(controlledEvidence).toHaveBeenCalledOnce();
  });

  test("keeps the session policy read in the same savepoint-protected transaction", async () => {
    const tx = transactionMock([[], [], []]);
    const resolveWindowMinutes = vi.fn().mockResolvedValue(15);
    const session = {
      user: { id: "33333333-3333-4333-8333-333333333333" },
      context: {
        tenantId: baseInput.tenantId,
        companyId: null,
        locationId: null
      }
    } as never;

    const result = await recordSessionDeniedDecisionInTransactionSafely(
      session,
      { action: "ADMINISTER", reason: "MFA_REQUIRED", resource: "ADMINISTRATION" },
      { client: tx as never, resolveWindowMinutes }
    );

    expect(result.recorded).toBe(true);
    expect(resolveWindowMinutes).toHaveBeenCalledWith(session, tx);
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      "SAVEPOINT authorization_denial_persistence"
    );
    expect(tx.$executeRawUnsafe).toHaveBeenLastCalledWith(
      "RELEASE SAVEPOINT authorization_denial_persistence"
    );
  });
});
