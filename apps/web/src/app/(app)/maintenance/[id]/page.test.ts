import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8"
);

describe("maintenance ticket detail actions", () => {
  it("uses maintenance.correct for the correction surface", () => {
    expect(source).toContain(
      "session.permissionCodes.includes(permissions.maintenanceCorrect)"
    );
    expect(source).not.toContain(
      "session.permissionCodes.includes(permissions.maintenanceCreate)"
    );
  });

  it("hides high-risk completion actions without a known independent reporter", () => {
    expect(source).toContain('["CRITICAL", "HIGH"].includes(ticket.priority)');
    expect(source).toContain(
      "ticket.hasReporter && !ticket.reportedByCurrentUser"
    );
    expect(source.match(/\{canComplete \? \(/g)).toHaveLength(2);
  });
});
