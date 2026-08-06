import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const missingDraftId = "11111111-1111-4111-8111-111111111111";

type Fixture = {
  tenantCode: string;
  branch: { email: string; password: string };
  privileged: { email: string; password: string; totpSecret: string };
  inventoryPilotConfiguration: {
    revisionId: string;
    revisionNumber: number;
    digest: string;
  };
};

function fixture(): Fixture {
  const file = process.env.OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE;
  if (!file) throw new Error("PRODUCTION_AUTH_E2E_FIXTURE_FILE_REQUIRED");
  return JSON.parse(readFileSync(file, "utf8")) as Fixture;
}

async function nextUnusedTotpCode(secret: string) {
  const untilNextPeriod = 30_000 - (Date.now() % 30_000);
  await new Promise((resolve) => setTimeout(resolve, untilNextPeriod + 250));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("PRODUCTION_AUTH_E2E_TOTP_SECRET_INVALID");
    bits += index.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(
    bits
      .match(/.{1,8}/g)
      ?.filter((byte) => byte.length === 8)
      .map((byte) => Number.parseInt(byte, 2)) ?? [],
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  if (offset + 3 >= digest.length)
    throw new Error("PRODUCTION_AUTH_E2E_TOTP_DIGEST_INVALID");
  const value =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  return String(value % 1_000_000).padStart(6, "0");
}

async function signInAsPrivilegedUser(page: Page) {
  const data = fixture();
  await page.goto("/sign-in");
  await page.getByLabel("Organization code").fill(data.tenantCode);
  await page.getByLabel("Email").fill(data.privileged.email);
  await page.getByLabel("Password").fill(data.privileged.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Verify authenticator" }),
  ).toBeVisible();
  await page
    .getByLabel("Authenticator or recovery code")
    .fill(await nextUnusedTotpCode(data.privileged.totpSecret));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Company Overview" }),
  ).toBeVisible();
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === "ogfi_demo_session",
    ),
  ).toBe(false);
  await page.goto("/opening-inventory/setup");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Inventory Pilot Setup Center",
    }),
  ).toBeVisible();
}

async function signInAsBranchUser(page: Page) {
  const data = fixture();
  await page.goto("/sign-in");
  await page.getByLabel("Organization code").fill(data.tenantCode);
  await page.getByLabel("Email").fill(data.branch.email);
  await page.getByLabel("Password").fill(data.branch.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Company Overview" }),
  ).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page
      .locator("html")
      .evaluate((element) => element.scrollWidth <= window.innerWidth),
  ).toBe(true);
}

async function expectMinimumHeight(locator: Locator, minimum = 44) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(minimum);
}

function draftIdFromUrl(page: Page) {
  const draftId = new URL(page.url()).searchParams.get("draft");
  expect(draftId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  return draftId!;
}

function draftQueueLink(page: Page, draftId: string) {
  return page.getByRole("link", {
    name: new RegExp(`Configuration draft ${draftId.slice(0, 8)}`, "i"),
  });
}

async function createDraft(page: Page, reason: string) {
  const previousDraftId = new URL(page.url()).searchParams.get("draft");
  await page
    .getByRole("button", { name: "Create configuration draft", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create inventory pilot configuration draft",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Draft purpose").fill(reason);
  await dialog
    .getByRole("button", { name: "Create configuration draft", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("draft"))
    .not.toBe(previousDraftId);
  return draftIdFromUrl(page);
}

async function acceptUnsavedNavigation(page: Page, link: Locator) {
  const dialog = page.waitForEvent("dialog");
  await link.click();
  const prompt = await dialog;
  expect(prompt.message()).toBe(
    "Discard unsaved configuration changes and leave this section?",
  );
  await prompt.accept();
}

async function expectSelectedDraft(page: Page, draftId: string, tab: string) {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.searchParams.get("draft")}:${url.searchParams.get("tab") ?? "endpoints"}`;
    })
    .toBe(`${draftId}:${tab}`);
  await expect(
    page.getByRole("heading", {
      name: `Configuration draft ${draftId.slice(0, 8)}`,
      exact: true,
    }),
  ).toBeVisible();
}

function firstEnabledCheckbox(fieldset: Locator) {
  return fieldset.locator('input[type="checkbox"]:enabled').first();
}

test.describe
  .serial("production-authenticated inventory pilot mutable Setup Center", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsPrivilegedUser(page);
  });

  test("keeps the Setup Center usable at desktop, tablet, and mobile widths", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/opening-inventory/setup");

      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Inventory Pilot Setup Center",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Revision queue" }),
      ).toBeVisible();
      await expectMinimumHeight(
        page.getByRole("button", {
          name: "Create configuration draft",
          exact: true,
        }),
      );
      await expectMinimumHeight(
        page.getByRole("link", { name: "Cutover queue", exact: true }),
      );
      await expectMinimumHeight(
        page.getByRole("link", { name: "Setup Center", exact: true }),
      );
      for (const section of [
        "Endpoints",
        "Items",
        "Named users",
        "Routes",
        "Readiness",
        "Activity",
      ]) {
        await expectMinimumHeight(
          page.getByRole("link", { name: section, exact: true }),
        );
      }
      await expectNoHorizontalOverflow(page);
    }
  });

  test("creates two unique drafts and isolates unsaved endpoint and item choices", async ({
    page,
  }, testInfo: TestInfo) => {
    const marker = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const draftA = await createDraft(
      page,
      `E2E Draft A mutable selection isolation ${marker}`,
    );
    const draftB = await createDraft(
      page,
      `E2E Draft B mutable selection isolation ${marker}`,
    );
    expect(draftA).not.toBe(draftB);
    await expectSelectedDraft(page, draftB, "endpoints");

    await draftQueueLink(page, draftA).click();
    await expectSelectedDraft(page, draftA, "endpoints");
    const endpointA = firstEnabledCheckbox(
      page.getByRole("group", { name: "Endpoint selections" }),
    );
    await expect(endpointA).not.toBeChecked();
    await endpointA.check();
    await expect(endpointA).toBeChecked();
    await expect(
      page.getByText("Unsaved configuration changes.", { exact: false }),
    ).toBeVisible();

    await acceptUnsavedNavigation(page, draftQueueLink(page, draftB));
    await expectSelectedDraft(page, draftB, "endpoints");
    await expect(
      firstEnabledCheckbox(
        page.getByRole("group", { name: "Endpoint selections" }),
      ),
    ).not.toBeChecked();

    await page.goBack();
    await expectSelectedDraft(page, draftA, "endpoints");
    await expect(
      firstEnabledCheckbox(
        page.getByRole("group", { name: "Endpoint selections" }),
      ),
    ).not.toBeChecked();
    await page.goForward();
    await expectSelectedDraft(page, draftB, "endpoints");

    await draftQueueLink(page, draftA).click();
    await page.getByRole("link", { name: "Items", exact: true }).click();
    await expectSelectedDraft(page, draftA, "items");
    const itemA = firstEnabledCheckbox(
      page.getByRole("group", { name: "Pilot item candidates" }),
    );
    await expect(itemA).not.toBeChecked();
    await itemA.check();
    await expect(itemA).toBeChecked();

    await acceptUnsavedNavigation(page, draftQueueLink(page, draftB));
    await expectSelectedDraft(page, draftB, "items");
    await expect(
      firstEnabledCheckbox(
        page.getByRole("group", { name: "Pilot item candidates" }),
      ),
    ).not.toBeChecked();

    await page.goBack();
    await expectSelectedDraft(page, draftA, "items");
    await expect(
      firstEnabledCheckbox(
        page.getByRole("group", { name: "Pilot item candidates" }),
      ),
    ).not.toBeChecked();
    await page.goForward();
    await expectSelectedDraft(page, draftB, "items");

    await page.getByRole("link", { name: "Routes", exact: true }).click();
    await expectSelectedDraft(page, draftB, "routes");
    const unavailableRoutesEvidence = page.getByRole("region", {
      name: "Purchase Request resolver evidence",
    });
    await expect(
      unavailableRoutesEvidence.getByText("Evidence unavailable", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      unavailableRoutesEvidence.getByText("This record fails closed", {
        exact: false,
      }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Readiness", exact: true }).click();
    await expectSelectedDraft(page, draftB, "readiness");
    await expect(
      page
        .getByRole("region", { name: "Purchase Request resolver evidence" })
        .getByText("Evidence unavailable", { exact: true }),
    ).toBeVisible();
    const purchaseRequestReadiness = page.locator("article").filter({
      has: page.getByText("Purchase Request", { exact: true }),
    });
    await expect(
      purchaseRequestReadiness.getByText("Blocked", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Ready now; live recheck required", { exact: true }),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("shows a safe state for a valid-format missing draft identity", async ({
    page,
  }) => {
    await page.goto(
      `/opening-inventory/setup?draft=${missingDraftId}&tab=endpoints`,
    );

    const alert = page.getByRole("alert");
    await expect(
      alert.getByRole("heading", { name: "Configuration record unavailable" }),
    ).toBeVisible();
    await expect(
      alert.getByText(
        "The selected record is no longer available in this company scope.",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(
      alert.getByRole("link", { name: "Back to revision queue" }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("draft")).toBe(missingDraftId);
    await expectNoHorizontalOverflow(page);
  });

  test("keeps a sealed revision immutable and creates an editable successor", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "production-auth-desktop",
      "The immutable workflow is exercised once; mobile layout is covered separately.",
    );
    const sealed = fixture().inventoryPilotConfiguration;
    expect(sealed.digest).toMatch(/^[a-f0-9]{64}$/);

    await page.goto(
      `/opening-inventory/setup?revision=${sealed.revisionId}&tab=routes`,
    );
    await expect(
      page.getByText("SEALED", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(`Sealed revision ${sealed.revisionNumber}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("Immutable SHA-256 digest")).toBeVisible();
    await expect(page.getByText(sealed.digest, { exact: true })).toBeVisible();
    await expect(page.getByText("Read-only", { exact: true })).toBeVisible();
    const routeResolverEvidence = page.getByRole("region", {
      name: "Purchase Request resolver evidence",
    });
    await expect(
      routeResolverEvidence.getByText("Exact evidence retained", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      routeResolverEvidence.getByText("purchase_request_approval_rule_v1", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      routeResolverEvidence.getByText("DEFAULT", { exact: true }),
    ).toBeVisible();
    await expect(
      routeResolverEvidence.getByText("normal", { exact: true }),
    ).toBeVisible();
    await expect(
      routeResolverEvidence.getByText("false", { exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "Abandon draft", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Seal configuration revision",
        exact: true,
      }),
    ).toHaveCount(0);

    await page.getByRole("link", { name: "Readiness", exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: "Purchase Request resolver evidence" })
        .getByText("Exact evidence retained", { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Create successor draft", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Create successor configuration draft",
    });
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel("Successor reason")
      .fill(
        "Prepare the next controlled inventory pilot configuration revision.",
      );
    await dialog
      .getByRole("button", { name: "Create successor draft", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    const successorDraftId = draftIdFromUrl(page);
    await expect(
      page.getByText("DRAFT", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(
        `Draft successor to sealed revision ${sealed.revisionNumber}`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: `Configuration draft ${successorDraftId.slice(0, 8)}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Save endpoint selections",
        exact: true,
      }),
    ).toBeEnabled();
    expect(
      await page
        .getByRole("group", { name: "Endpoint selections" })
        .locator('input[type="checkbox"]:checked')
        .count(),
    ).toBeGreaterThan(0);
    await page.getByRole("link", { name: "Items", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Save item selections",
        exact: true,
      }),
    ).toBeEnabled();
    expect(
      await page
        .getByRole("group", { name: "Pilot item candidates" })
        .locator('input[type="checkbox"]:checked')
        .count(),
    ).toBeGreaterThan(0);

    await page.goto(
      `/opening-inventory/setup?revision=${sealed.revisionId}&tab=routes`,
    );
    await expect(
      page.getByText("SEALED", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(sealed.digest, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save route bindings", exact: true }),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});

test("denies the Setup Center to a production-authenticated branch account", async ({
  page,
}) => {
  await signInAsBranchUser(page);
  await page.goto("/opening-inventory/setup");
  await expect(
    page.getByRole("heading", { name: "Inventory Pilot Setup Center" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Company Overview" }),
  ).toBeVisible();
});
