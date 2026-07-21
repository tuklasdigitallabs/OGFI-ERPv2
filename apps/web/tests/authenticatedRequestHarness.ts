import { createHash } from "node:crypto";
import { vi } from "vitest";

const requestCookies = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = requestCookies.get(name);
      return value ? { name, value } : undefined;
    },
    set: (
      nameOrCookie: string | { name: string; value: string },
      value?: string,
    ) => {
      if (typeof nameOrCookie === "string") {
        if (value !== undefined) requestCookies.set(nameOrCookie, value);
        return;
      }
      requestCookies.set(nameOrCookie.name, nameOrCookie.value);
    },
    delete: (name: string) => requestCookies.delete(name),
  }),
  headers: async () => new Headers({
    "user-agent": "ogfi-authorization-integration-test",
    "x-forwarded-for": "127.0.0.1",
  }),
}));

export function configureAuthenticatedRequest(input: {
  sessionToken: string;
  selectedLocationId?: string;
}) {
  process.env.AUTH_MODE = "local";
  requestCookies.clear();
  requestCookies.set("ogfi_session", input.sessionToken);
  if (input.selectedLocationId) {
    requestCookies.set("ogfi_demo_location", input.selectedLocationId);
  }
}

export function clearAuthenticatedRequest() {
  requestCookies.clear();
  delete process.env.AUTH_MODE;
}

export function authenticationSessionTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
