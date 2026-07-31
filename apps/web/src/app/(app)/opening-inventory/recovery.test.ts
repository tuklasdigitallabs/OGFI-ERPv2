import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const loading = readFileSync(fileURLToPath(new URL("./loading.tsx", import.meta.url)), "utf8");
const error = readFileSync(fileURLToPath(new URL("./error.tsx", import.meta.url)), "utf8");

describe("opening inventory route recovery states", () => {
  it("shows an accessible loading state", () => {
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading the authorized opening-inventory workspace");
  });

  it("offers retry without rendering raw internal error details", () => {
    expect(error).toContain('role="alert"');
    expect(error).toContain("Try again");
    expect(error).not.toContain("error.message");
    expect(error).not.toContain("error.stack");
  });
});
