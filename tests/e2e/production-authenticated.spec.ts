import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

type Fixture = {
  tenantCode: string;
  branch: { email: string; password: string };
  privileged: { email: string; password: string; totpSecret: string };
};

function fixture(): Fixture {
  const file = process.env.OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE;
  if (!file) throw new Error("PRODUCTION_AUTH_E2E_FIXTURE_FILE_REQUIRED");
  return JSON.parse(readFileSync(file, "utf8")) as Fixture;
}

async function enterPassword(page: import("@playwright/test").Page, account: { email: string; password: string }) {
  const data = fixture();
  await page.goto("/sign-in");
  await page.getByLabel("Organization code").fill(data.tenantCode);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function nextUnusedTotpCode(secret: string, email: string) {
  const untilNextPeriod = 30_000 - (Date.now() % 30_000);
  await new Promise((resolve) => setTimeout(resolve, untilNextPeriod + 250));
  // RFC 6238, matching the SHA-1 / 30-second TOTP configuration in the app.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("PRODUCTION_AUTH_E2E_TOTP_SECRET_INVALID");
    bits += index.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{1,8}/g)?.filter((byte) => byte.length === 8).map((byte) => Number.parseInt(byte, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  if (offset + 3 >= digest.length) throw new Error("PRODUCTION_AUTH_E2E_TOTP_DIGEST_INVALID");
  const value = (((digest[offset] ?? 0) & 0x7f) << 24) | ((digest[offset + 1] ?? 0) << 16) | ((digest[offset + 2] ?? 0) << 8) | (digest[offset + 3] ?? 0);
  void email;
  return String(value % 1_000_000).padStart(6, "0");
}

test("production local authentication rejects bad credentials without issuing a session", async ({ page }) => {
  const data = fixture();
  await enterPassword(page, { email: data.branch.email, password: "not-the-runtime-password" });
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect((await page.context().cookies()).find((cookie) => cookie.name === "__Host-ogfi_session")).toBeUndefined();
});

test("production branch password authentication yields a secure scoped session and preserves denial", async ({ browser, page }) => {
  const data = fixture();
  await enterPassword(page, data.branch);
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();
  const session = (await page.context().cookies()).find((cookie) => cookie.name === "__Host-ogfi_session");
  expect(session).toMatchObject({ secure: true, httpOnly: true, sameSite: "Lax", path: "/", domain: "127.0.0.1" });
  expect((await page.context().cookies()).some((cookie) => cookie.name === "ogfi_demo_session")).toBe(false);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Core Administration" })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();

  const anonymous = await browser.newContext();
  const anonymousPage = await anonymous.newPage();
  await anonymousPage.goto("https://127.0.0.1:3443/admin");
  await expect(anonymousPage.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await anonymous.close();
});

test("production privileged password and runtime TOTP MFA establish the secure session", async ({ page }) => {
  const data = fixture();
  await enterPassword(page, data.privileged);
  await expect(page.getByRole("heading", { name: "Verify authenticator" })).toBeVisible();
  await page.getByLabel("Authenticator or recovery code").fill(await nextUnusedTotpCode(data.privileged.totpSecret, data.privileged.email));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();
  await expect(page).toHaveURL(/^https:\/\/127\.0\.0\.1:3443\//);
  expect((await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth))).toBe(true);
});
