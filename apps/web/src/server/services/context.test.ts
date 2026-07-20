import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertSessionFresh } from "./context";

describe("session freshness controls", () => {
  test("rejects sessions issued before a privilege epoch change", () => {
    expect(() =>
      assertSessionFresh({
        userUpdatedAt: new Date("2026-07-07T12:00:05.000Z"),
        sessionIssuedAt: "2026-07-07T12:00:00.000Z"
      })
    ).toThrow("SESSION_REVALIDATION_REQUIRED");
    expect(() =>
      assertSessionFresh({
        userUpdatedAt: new Date("2026-07-07T12:00:00.500Z"),
        sessionIssuedAt: "2026-07-07T12:00:00.000Z"
      })
    ).not.toThrow();
  });

  test("demo auth stores and clears session issued-at evidence", () => {
    const signInSource = readFileSync(
      path.resolve(__dirname, "../../app/(auth)/sign-in/page.tsx"),
      "utf8"
    );
    const signOutSource = readFileSync(
      path.resolve(__dirname, "../../app/(auth)/sign-out/route.ts"),
      "utf8"
    );
    const contextSource = readFileSync(path.resolve(__dirname, "context.ts"), "utf8");
    const coreAdminSource = readFileSync(
      path.resolve(__dirname, "coreAdmin.ts"),
      "utf8"
    );

    expect(signInSource).toContain("ogfi_demo_session_issued_at");
    expect(signOutSource).toContain("ogfi_demo_session_issued_at");
    expect(contextSource).toContain("assertSessionFresh");
    expect(contextSource).toContain("SESSION_REVALIDATION_REQUIRED");
    expect(coreAdminSource).toContain("touchUserPrivilegeEpoch");
  });
});
