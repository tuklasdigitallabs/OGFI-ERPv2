import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8"
);

describe("Authentication deferred-surface contract", () => {
  it("keeps Recovery as the active section and labels activation delivery as deferred", () => {
    expect(source).toContain(">Recovery</span>");
    expect(source).toContain(
      "Account readiness and activation delivery remain separate follow-up sections."
    );
  });

  it("does not render deferred activation or delivery action panels", () => {
    expect(source).not.toContain("ActivationPanel");
    expect(source).not.toContain("DeliveryRetryPanel");
    expect(source).not.toContain("Send activation link");
    expect(source).not.toContain("Retry delivery");
  });
});
