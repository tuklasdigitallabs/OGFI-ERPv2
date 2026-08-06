import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "../../packages/database/src/client";

type Fixture = {
  tenantCode: string;
  privileged: { email: string; password: string; totpSecret: string };
  approvalWorklist: {
    targetApprovalInstanceId: string;
    targetSourceId: string;
    targetPublicReference: string;
    targetRequesterUserId: string;
    targetLocationId: string;
    tenantId: string;
    companyId: string;
    fixtureApprovalInstanceIds: string[];
    expectedMinimumPending: number;
  };
};

const admittedBoundedLane =
  process.env.NODE_ENV === "production" &&
  process.env.APP_ENV === "uat" &&
  process.env.CI === "true" &&
  process.env.AUTH_MODE === "local" &&
  process.env.AUTH_HARDENED_UAT_RUNTIME_ENABLED === "true" &&
  process.env.BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED === "true" &&
  process.env.APPROVAL_ROUTING_V1_ENABLED === "false";

function fixture(): Fixture {
  const file = process.env.OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE;
  if (!file) throw new Error("PRODUCTION_AUTH_E2E_FIXTURE_FILE_REQUIRED");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<Fixture>;
  if (!parsed.approvalWorklist) {
    throw new Error("PRODUCTION_AUTH_E2E_APPROVAL_WORKLIST_FIXTURE_REQUIRED");
  }
  return parsed as Fixture;
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
  if (offset + 3 >= digest.length) {
    throw new Error("PRODUCTION_AUTH_E2E_TOTP_DIGEST_INVALID");
  }
  const value =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  return String(value % 1_000_000).padStart(6, "0");
}

async function signInAsPrivilegedApprover(page: Page) {
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
  await expect
    .poll(async () =>
      (await page.context().cookies()).some(
        (cookie) => cookie.name === "__Host-ogfi_session",
      ),
    )
    .toBe(true);
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === "ogfi_demo_session",
    ),
  ).toBe(false);
  await page.context().addCookies([
    {
      name: "ogfi_demo_location",
      value: data.approvalWorklist.targetLocationId,
      url: "https://127.0.0.1:3443",
    },
  ]);
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

async function approvalTotal(page: Page) {
  const text = await page
    .getByText(/Showing \d+-\d+ of \d+ approvals/)
    .textContent();
  const match = text?.match(/of\s+(\d+)\s+approvals/);
  if (!match?.[1]) throw new Error("APPROVAL_PAGINATION_TOTAL_NOT_FOUND");
  return Number(match[1]);
}

async function openApprovalFromQueue(page: Page, publicReference: string) {
  await page.goto("/approvals");
  for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
    const selectedRow = page
      .getByTestId("approval-row")
      .filter({ hasText: publicReference });
    if ((await selectedRow.count()) === 1) {
      await selectedRow.getByRole("link", { name: "Review" }).click();
      return;
    }
    const next = page.getByRole("link", { name: "Next" });
    if ((await next.count()) === 0) break;
    await next.click();
  }
  throw new Error(`APPROVAL_QUEUE_TARGET_NOT_FOUND:${publicReference}`);
}

test.describe("hardened-UAT production-authenticated bounded Approval Worklist", () => {
  test.skip(
    !admittedBoundedLane,
    "Requires the exact hardened bounded-UAT evidence runtime; ordinary production-auth evidence must remain closed.",
  );

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("is responsive, paginated, review-complete, stale-safe, and refreshes after one decision", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "production-auth-desktop",
      "One destructive disposable scenario exercises all three viewport sizes once.",
    );
    const data = fixture();
    await signInAsPrivilegedApprover(page);

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/approvals");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Inventory Control UAT Approval Worklist",
        }),
      ).toBeVisible();
      await expect(
        page.getByText(
          /Local UAT only: this partial worklist shows eligible Purchase Requests, quotation recommendations, Purchase Orders, transfers, stock-count reviews, wastage, and stock adjustments\./,
        ),
      ).toBeVisible();
      await expect(page.getByTestId("approval-row")).toHaveCount(10);
      await expect(
        page.getByText(/Showing 1-10 of \d+ approvals/),
      ).toBeVisible();
      expect(await approvalTotal(page)).toBeGreaterThanOrEqual(
        data.approvalWorklist.expectedMinimumPending,
      );
      await expectMinimumHeight(page.getByRole("link", { name: "Next" }));
      await expectNoHorizontalOverflow(page);

      await page.getByRole("link", { name: "Next" }).click();
      await expect(page).toHaveURL(/(?:\?|&)page=2(?:&|$)/);
      await expect(page.getByTestId("approval-row").first()).toBeVisible();
      await expectMinimumHeight(page.getByRole("link", { name: "Previous" }));
      await expectNoHorizontalOverflow(page);

      await openApprovalFromQueue(
        page,
        data.approvalWorklist.targetPublicReference,
      );
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Inventory Control UAT Approval Review",
        }),
      ).toBeVisible();
      await expect(
        page.getByText(data.approvalWorklist.targetPublicReference, {
          exact: true,
        }).first(),
      ).toBeVisible();
      for (const heading of [
        "Source timing and value",
        "Decision rationale",
        "Material lines",
        "Evidence and authoritative source",
        "Review decision",
        "Decision composer",
      ]) {
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      }
      for (const materialFact of [
        "Company",
        "Brand",
        "Location",
        "Current step",
        "Current approver",
        "Required permission",
        "Step activated",
        "Approval due",
        "Required date",
        "Submitted source updated",
        "Estimated total",
        "Urgency",
        "Justification",
        "Unit amount",
        "Line total",
      ]) {
        await expect(
          page.getByText(materialFact, { exact: true }).first(),
        ).toBeVisible();
      }
      await expect(
        page
          .getByText("High-risk beef inventory control line", { exact: true })
          .first(),
      ).toBeVisible();
      await expect(page.getByText(/12\.5 KG/).first()).toBeVisible();
      for (const decision of [
        "Approve Purchase Request",
        "Return for Revision",
        "Reject Purchase Request",
      ]) {
        await expectMinimumHeight(page.getByRole("button", { name: decision }));
      }
      await expect(page.locator('button[name="decision"]')).toHaveCount(3);
      await expectNoHorizontalOverflow(page);
    }

    const beforeTotal = await (async () => {
      await page.goto("/approvals");
      return approvalTotal(page);
    })();
    await openApprovalFromQueue(
      page,
      data.approvalWorklist.targetPublicReference,
    );
    const remarks = page.getByLabel("Decision remarks");
    const preservedDraft = "Reviewed values and scope before controlled approval.";
    await remarks.fill(preservedDraft);

    await prisma.purchaseRequestComment.create({
      data: {
        purchaseRequestId: data.approvalWorklist.targetSourceId,
        tenantId: data.approvalWorklist.tenantId,
        companyId: data.approvalWorklist.companyId,
        authorUserId: data.approvalWorklist.targetRequesterUserId,
        body: "Source comment changed after the approver loaded the review.",
      },
    });
    await page.getByRole("button", { name: "Approve Purchase Request" }).click();
    const staleAlert = page.getByRole("alert");
    await expect(staleAlert).toContainText("Decision not completed");
    await expect(staleAlert).toContainText(
      "This approval changed or the review expired.",
    );
    await expect(staleAlert).toContainText(
      "Your remarks and evidence draft remain available.",
    );
    await expect(remarks).toHaveValue(preservedDraft);
    for (const decision of [
      "Approve Purchase Request",
      "Return for Revision",
      "Reject Purchase Request",
    ]) {
      await expect(page.getByRole("button", { name: decision })).toBeDisabled();
    }
    const reload = page.getByRole("link", { name: "Reload current review" });
    await expectMinimumHeight(reload);

    await reload.click();
    await expect(
      page.getByText(
        "Source comment changed after the approver loaded the review.",
      ),
    ).toBeVisible();
    await page
      .getByLabel("Decision remarks")
      .fill("Reloaded the current snapshot and confirmed the controlled approval.");
    await page.getByRole("button", { name: "Approve Purchase Request" }).click();
    await expect(page).toHaveURL(
      /\/approvals\?success=APPROVAL_DECISION_APPROVED/,
    );
    await expect(page.getByRole("status")).toContainText("Action completed");
    await expect(page.getByRole("status")).toContainText(
      "The approval decision was recorded. The queue and authoritative source status were refreshed.",
    );
    await expect(page.getByRole("status")).toContainText(
      "APPROVAL_DECISION_APPROVED",
    );
    await expect.poll(() => approvalTotal(page)).toBe(beforeTotal - 1);
    await expectNoHorizontalOverflow(page);
  });
});
