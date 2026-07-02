import { expect, test, type Locator, type Page } from "@playwright/test";

const approverEmail = process.env.DEMO_APPROVER_EMAIL ?? "approver@example.test";
const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@example.test";
const requesterEmail = process.env.DEMO_USER_EMAIL ?? "user@example.test";

async function expectDemoSession(page: Page, email: string) {
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      const value = cookies.find((cookie) => cookie.name === "ogfi_demo_session")?.value;
      return value ? decodeURIComponent(value) : value;
    })
    .toBe(email);
}

async function signInAs(
  page: Page,
  buttonName: "Sign in as Requester" | "Sign in as Approver" | "Sign in as Admin",
  email: string,
  landingPath: string,
  landingHeading: string
) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: buttonName }).click();
  await expectDemoSession(page, email);
  await page.goto(landingPath);
  await expect(page.getByRole("heading", { name: landingHeading })).toBeVisible();
}

async function createDraftPurchaseRequest(page: Page) {
  await page
    .getByRole("button", { name: "Create Draft Purchase Request" })
    .click({ force: true });
}

async function gotoRowView(page: Page, row: Locator) {
  const href = await row.getByRole("link", { name: "View" }).getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href ?? "/purchase-requests");
}

async function gotoAuditEvent(page: Page, eventType: string) {
  const href = await page
    .getByTestId("admin-audit-row")
    .filter({ hasText: eventType })
    .first()
    .getByRole("link", { name: "View Event" })
    .getAttribute("href");
  expect(href).toBeTruthy();
  expect(href).toMatch(/^\/admin\/audit\/[^/]+$/);
  await page.goto(href ?? "/admin");
  await expect(page.getByRole("heading", { name: "Audit Event" })).toBeVisible();
  await expect(page.getByText(eventType).first()).toBeVisible();
  await expect(page.getByText("Append-only")).toBeVisible();
}

async function gotoCoreAdmin(page: Page) {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Core Administration" })).toBeVisible();
}

test("non-admin users cannot open core administration", async ({ page }) => {
  await signInAs(
    page,
    "Sign in as Requester",
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Purchase Requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Core Administration" })).not.toBeVisible();

  await page.goto("/admin/users/00000000-0000-4000-8000-000000000006");
  await expect(page.getByRole("heading", { name: "Purchase Requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "User Access" })).not.toBeVisible();

  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { name: "Purchase Requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Suppliers" })).not.toBeVisible();

  await page.goto("/items");
  await expect(page.getByRole("heading", { name: "Purchase Requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Item Master" })).not.toBeVisible();

  await page.goto("/quotes");
  await expect(page.getByRole("heading", { name: "Purchase Requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Supplier Quotes" })).not.toBeVisible();
});

test("returned purchase requests can be reopened as draft", async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);

  await signInAs(
    page,
    "Sign in as Requester",
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );

  const marker = `Returned PR ${testInfo.project.name} ${Date.now()} ${Math.random()
    .toString(16)
    .slice(2, 8)}`;
  await page.getByLabel("Required date").fill("2026-07-18");
  await page.getByLabel("Urgency").fill("Normal");
  await page.getByLabel("Justification").fill(`Return/reopen validation for ${marker}`);
  await page.getByLabel("Line description").fill(marker);
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("UOM", { exact: true }).fill("kg");
  await page.getByLabel("Purpose").fill("Branch operating requirement");
  await createDraftPurchaseRequest(page);
  await expect(page.getByRole("heading", { name: marker })).toBeVisible();

  await page.getByRole("button", { name: "Submit for Approval" }).click();
  await expect(page.getByText("PENDING APPROVAL")).toBeVisible();

  await signInAs(page, "Sign in as Approver", approverEmail, "/approvals", "Approval Inbox");
  const approvalRow = page.getByTestId("approval-row").filter({ hasText: marker });
  await approvalRow.getByRole("link", { name: "Review" }).click();
  const approverComment = `Approver comment ${marker}`;
  await page.getByLabel("Add comment").fill(approverComment);
  await page.getByRole("button", { name: "Add Comment" }).click();
  await expect(page.getByTestId("approval-comment").filter({ hasText: approverComment })).toBeVisible();
  await page.getByLabel("Return remarks").fill(`Return for revision ${marker}`);
  await page.getByRole("button", { name: "Return for Revision" }).click();
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();

  await signInAs(
    page,
    "Sign in as Requester",
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );
  const requestRow = page.getByTestId("purchase-request-row").filter({ hasText: marker });
  await expect(requestRow.getByText("RETURNED", { exact: true })).toBeVisible();
  await gotoRowView(page, requestRow);
  await expect(page.getByTestId("purchase-request-comment").filter({ hasText: approverComment })).toBeVisible();
  await expect(page.getByText("purchase_request.returned")).toBeVisible();
  await page.getByRole("button", { name: "Reopen as Draft" }).click();
  await expect(page.getByText("DRAFT", { exact: true })).toBeVisible();
  await expect(page.getByText("purchase_request.reopened")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for Approval" })).toBeVisible();
});

test("draft purchase requests can be cancelled with audit history", async ({
  page
}, testInfo) => {
  await signInAs(
    page,
    "Sign in as Requester",
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );

  const marker = `Cancelled PR ${testInfo.project.name} ${Date.now()} ${Math.random()
    .toString(16)
    .slice(2, 8)}`;
  await page.getByLabel("Required date").fill("2026-07-19");
  await page.getByLabel("Urgency").fill("Normal");
  await page.getByLabel("Justification").fill(`Cancellation validation for ${marker}`);
  await page.getByLabel("Line description").fill(marker);
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("UOM", { exact: true }).fill("kg");
  await page.getByLabel("Purpose").fill("Branch operating requirement");
  await createDraftPurchaseRequest(page);
  await expect(page.getByRole("heading", { name: marker })).toBeVisible();
  const comment = `Draft comment ${marker}`;
  await page.getByLabel("Add comment").fill(comment);
  await page.getByRole("button", { name: "Add Comment" }).click();
  await expect(page.getByTestId("purchase-request-comment").filter({ hasText: comment })).toBeVisible();
  await expect(page.getByText("purchase_request.comment_added")).toBeVisible();
  await page.getByLabel("Cancellation reason").fill(`Cancel validation ${marker}`);
  await page.getByRole("button", { name: "Cancel Purchase Request" }).click();
  await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
  await expect(page.getByText("purchase_request.cancelled")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for Approval" })).not.toBeVisible();
});

test("purchase requests can be rejected with remarks and action history", async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);

  await signInAs(
    page,
    "Sign in as Requester",
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );

  const marker = `Rejected PR ${testInfo.project.name} ${Date.now()} ${Math.random()
    .toString(16)
    .slice(2, 8)}`;
  await page.getByLabel("Required date").fill("2026-07-20");
  await page.getByLabel("Urgency").fill("Normal");
  await page.getByLabel("Justification").fill(`Rejection validation for ${marker}`);
  await page.getByLabel("Line description").fill(marker);
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("UOM", { exact: true }).fill("kg");
  await page.getByLabel("Purpose").fill("Branch operating requirement");
  await createDraftPurchaseRequest(page);
  await expect(page.getByRole("heading", { name: marker })).toBeVisible();
  await page.getByRole("button", { name: "Submit for Approval" }).click();
  await expect(page.getByText("PENDING APPROVAL")).toBeVisible();

  await signInAs(page, "Sign in as Approver", approverEmail, "/approvals", "Approval Inbox");
  await page
    .getByTestId("approval-row")
    .filter({ hasText: marker })
    .getByRole("link", { name: "Review" })
    .click();
  const rejectRemarks = `Reject validation ${marker}`;
  await page.getByLabel("Reject remarks").fill(rejectRemarks);
  await page.getByRole("button", { name: "Reject Purchase Request" }).click();
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();

  await signInAs(
    page,
    "Sign in as Requester",
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );
  const rejectedRow = page.getByTestId("purchase-request-row").filter({ hasText: marker });
  await expect(rejectedRow.getByText("REJECTED", { exact: true })).toBeVisible();
  await gotoRowView(page, rejectedRow);
  await expect(page.getByText("purchase_request.rejected")).toBeVisible();
  await expect(
    page
      .getByTestId("purchase-request-approval-action")
      .filter({ hasText: "REJECTED" })
      .filter({ hasText: "Configured Approver" })
      .filter({ hasText: rejectRemarks })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for Approval" })).not.toBeVisible();
});

test("first milestone purchase request path works end to end", async ({
  page
}, testInfo) => {
  test.setTimeout(240_000);

  await signInAs(
    page,
    "Sign in as Requester",
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );

  const marker = `Test PR ${testInfo.project.name} ${Date.now()} ${Math.random()
    .toString(16)
    .slice(2, 8)}`;
  await page.getByLabel("Required date").fill("2026-07-15");
  await page.getByLabel("Urgency").fill("Normal");
  await page.getByLabel("Justification").fill(`Local milestone validation for ${marker}`);
  await page.getByLabel("Line description").fill(marker);
  await page.getByLabel("Quantity").fill("3");
  await page.getByLabel("UOM", { exact: true }).fill("kg");
  await page.getByLabel("Purpose").fill("Branch operating requirement");
  await createDraftPurchaseRequest(page);

  await expect(page.getByRole("heading", { name: marker })).toBeVisible();
  await expect(page.getByText("purchase_request.created")).toBeVisible();

  await page.getByRole("button", { name: "Submit for Approval" }).click();
  await expect(page.getByText("PENDING APPROVAL")).toBeVisible();
  await expect(page.getByText("purchase_request.submitted")).toBeVisible();

  await page.goto("/approvals");
  await expect(page.getByRole("heading", { name: "Purchase Requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).not.toBeVisible();

  await signInAs(page, "Sign in as Approver", approverEmail, "/approvals", "Approval Inbox");
  const approvalRow = page.getByTestId("approval-row").filter({ hasText: marker });
  await approvalRow.getByRole("link", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Approval Review" })).toBeVisible();
  await page.getByRole("button", { name: "Approve Purchase Request" }).click();
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();

  await page.goto("/purchase-requests");
  await page.getByLabel("Search").fill(marker);
  await page.getByLabel("Status").selectOption("APPROVED");
  await page.getByRole("button", { name: "Apply Filters" }).click({ force: true });
  const approvedRequestRow = page.getByTestId("purchase-request-row").filter({ hasText: marker });
  await expect(approvedRequestRow.getByText("APPROVED")).toBeVisible();
  const exportResponse = await page.request.get(
    `/purchase-requests/export?search=${encodeURIComponent(marker)}&status=APPROVED`
  );
  expect(exportResponse.ok()).toBe(true);
  const exportCsv = await exportResponse.text();
  expect(exportCsv).toContain(marker);
  expect(exportCsv).toContain("APPROVED");
  await approvedRequestRow.getByRole("link", { name: "View" }).click();
  await expect(
    page.getByTestId("purchase-request-approval-action").filter({ hasText: "APPROVED" }).filter({ hasText: "Configured Approver" })
  ).toBeVisible();

  await signInAs(page, "Sign in as Admin", adminEmail, "/admin", "Core Administration");
  await page.goto("/quotes");
  await expect(page.getByRole("heading", { name: "Supplier Quotes" })).toBeVisible();
  const quoteRequestSelect = page.locator('select[name="purchaseRequestId"]');
  await expect(quoteRequestSelect).toContainText(marker);
  const quoteRequestOptionValue = await quoteRequestSelect
    .locator("option", { hasText: marker })
    .first()
    .getAttribute("value");
  expect(quoteRequestOptionValue).toBeTruthy();
  await quoteRequestSelect.selectOption(quoteRequestOptionValue ?? "");
  await page
    .locator('select[name="supplierId"]')
    .selectOption({ label: "CONFIGURED-SUPPLIER / Configured Supplier" });
  const quoteReference = `QUOTE-${testInfo.project.name.toUpperCase()}-${Date.now()}`;
  await page.getByLabel("Quote reference").fill(quoteReference);
  await page.getByLabel("Quote date").fill("2026-07-02");
  await page.getByLabel("Valid until").fill("2026-07-31");
  await page.getByLabel("Quantity").fill("3");
  await page.locator('select[name="uomId"]').selectOption({ label: "KG" });
  await page.getByLabel("Unit price").fill("42.5");
  await page.getByLabel("Lead days").fill("2");
  await page.getByLabel("Availability").fill("Available");
  await page.getByLabel("Terms").fill("Net 15");
  await page.getByLabel("Notes").fill(`E2E quote note for ${marker}`);
  await page.getByLabel("Recording reason").fill(`E2E quote capture for ${marker}`);
  await page.getByRole("button", { name: "Record Supplier Quote" }).click({ force: true });
  const currentQuoteRequestRow = page.getByTestId("quote-request-row").filter({ hasText: marker });
  const supplierQuoteRow = currentQuoteRequestRow
    .getByTestId("supplier-quote-row")
    .filter({ hasText: quoteReference });
  await expect(supplierQuoteRow.filter({ hasText: "Configured Supplier" })).toBeVisible();
  await expect(supplierQuoteRow.filter({ hasText: "PHP 127.50" })).toBeVisible();
  await expect(supplierQuoteRow.filter({ hasText: "Lowest recorded cost" })).toBeVisible();
  await currentQuoteRequestRow
    .locator('select[name="selectedSupplierQuotationId"]')
    .selectOption({ label: `Configured Supplier / ${quoteReference} / PHP 127.50` });
  await currentQuoteRequestRow
    .getByLabel("Selection reason")
    .fill(`Recommended supplier for ${marker}`);
  await currentQuoteRequestRow
    .getByLabel("Single-source justification")
    .fill(`Only recorded quote for ${marker}`);
  await currentQuoteRequestRow
    .getByRole("button", { name: "Record Recommendation" })
    .click({ force: true });
  const recommendation = currentQuoteRequestRow
    .getByTestId("quotation-recommendation")
    .filter({ hasText: quoteReference });
  await expect(recommendation.filter({ hasText: "Configured Supplier" })).toBeVisible();
  await expect(recommendation.filter({ hasText: `Recommended supplier for ${marker}` })).toBeVisible();
  await expect(recommendation.filter({ hasText: `Only recorded quote for ${marker}` })).toBeVisible();
  await currentQuoteRequestRow
    .getByRole("button", { name: "Submit Recommendation" })
    .click({ force: true });
  await expect(currentQuoteRequestRow.getByText("PENDING APPROVAL")).toBeVisible();

  await signInAs(page, "Sign in as Approver", approverEmail, "/approvals", "Approval Inbox");
  const recommendationApprovalRow = page
    .getByTestId("approval-row")
    .filter({ hasText: quoteReference })
    .filter({ hasText: "QuotationRecommendation" });
  await recommendationApprovalRow.getByRole("link", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Approval Review" })).toBeVisible();
  await expect(page.getByText("Quotation Recommendation Approval")).toBeVisible();
  await expect(page.getByText("Configured Supplier", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve Recommendation" }).click();
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();

  await signInAs(page, "Sign in as Admin", adminEmail, "/quotes", "Supplier Quotes");
  await expect(
    page
      .getByTestId("quote-request-row")
      .filter({ hasText: marker })
      .getByTestId("quotation-recommendation")
      .filter({ hasText: quoteReference })
      .filter({ hasText: "Configured Supplier" })
  ).toBeVisible();
  await expect(
    page
      .getByTestId("quote-request-row")
      .filter({ hasText: marker })
      .getByTestId("quotation-recommendation-status")
      .getByText("APPROVED")
  ).toBeVisible();
  const quoteExportResponse = await page.request.get("/quotes/export");
  expect(quoteExportResponse.ok()).toBe(true);
  const quoteExportCsv = await quoteExportResponse.text();
  expect(quoteExportCsv).toContain(quoteReference);
  expect(quoteExportCsv).toContain("Configured Supplier");
  expect(quoteExportCsv).toContain("true");
  await signInAs(
    page,
    "Sign in as Requester",
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );
  await page.getByLabel("Search").fill(marker);
  await page.getByLabel("Status").selectOption("APPROVED");
  await page.getByRole("button", { name: "Apply Filters" }).click({ force: true });
  const approvedRequestHref = await page
    .getByTestId("purchase-request-row")
    .filter({ hasText: marker })
    .getByRole("link", { name: "View" })
    .getAttribute("href");
  expect(approvedRequestHref).toBeTruthy();
  await page.goto(approvedRequestHref ?? "/purchase-requests");
  const requestQuoteRow = page.getByTestId("purchase-request-quote-row").filter({ hasText: quoteReference });
  await expect(requestQuoteRow.filter({ hasText: "Configured Supplier" })).toBeVisible();
  await expect(requestQuoteRow.filter({ hasText: "PHP 127.50" })).toBeVisible();

  await signInAs(page, "Sign in as Admin", adminEmail, "/admin", "Core Administration");
  await expect(page.getByRole("heading", { name: "Core Administration" })).toBeVisible();
  await expect(page.getByLabel("Location context")).toHaveValue(
    "00000000-0000-4000-8000-000000000004"
  );
  await expect(page.getByLabel("Location context")).toContainText("Configured Location");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByRole("heading", { name: "Core Administration" })).toBeVisible();
  await expect(
    page.getByTestId("admin-user-row").filter({ hasText: "Configured Admin" })
  ).toBeVisible();
  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { name: "Suppliers" })).toBeVisible();
  await expect(
    page.getByTestId("supplier-row").filter({ hasText: "CONFIGURED-SUPPLIER" })
  ).toBeVisible();
  const supplierCode = `E2E-${testInfo.project.name.toUpperCase()}-${Date.now()}`;
  await page.getByLabel("Supplier code").fill(supplierCode);
  await page.getByLabel("Legal name").fill(`${marker} Supplier Legal`);
  await page.getByLabel("Trading name").fill(`${marker} Supplier`);
  await page.getByLabel("Payment terms").fill("Net 15");
  await page.getByLabel("Primary contact").fill("E2E Contact");
  await page.getByLabel("Contact role").fill("Sales");
  await page.getByLabel("Contact email").fill("e2e-supplier@example.test");
  await page.getByLabel("Creation reason").fill(`E2E supplier setup for ${marker}`);
  await page.getByRole("button", { name: "Create Supplier" }).click({ force: true });
  const supplierRow = page.getByTestId("supplier-row").filter({ hasText: supplierCode });
  await expect(supplierRow).toBeVisible();
  await supplierRow.getByLabel("Deactivation reason").fill(`E2E supplier deactivation for ${marker}`);
  await supplierRow.getByRole("button", { name: "Deactivate Supplier" }).click({ force: true });
  await expect(page.getByTestId("supplier-row").filter({ hasText: supplierCode }).getByText("INACTIVE")).toBeVisible();
  await page.goto("/items");
  await expect(page.getByRole("heading", { name: "Item Master" })).toBeVisible();
  await expect(
    page.getByTestId("item-row").filter({ hasText: "CONFIGURED-ITEM" })
  ).toBeVisible();
  const itemStamp = `${testInfo.project.name.toUpperCase()}-${Date.now()}`;
  const categoryCode = `CAT-${itemStamp}`;
  const uomCode = `UOM-${itemStamp}`;
  const itemCode = `ITEM-${itemStamp}`;
  const itemName = `${marker} Item`;
  await page.getByLabel("Category code").fill(categoryCode);
  await page.getByLabel("Category name").fill(`${marker} Category`);
  await page.getByLabel("Inventory class").fill("food");
  await page.getByLabel("Category creation reason").fill(`E2E category setup for ${marker}`);
  await page.getByRole("button", { name: "Create Category" }).click({ force: true });
  await expect(page.getByTestId("item-category-row").filter({ hasText: categoryCode })).toBeVisible();
  await page.getByLabel("UOM code").fill(uomCode);
  await page.getByLabel("UOM name").fill(`${marker} Unit`);
  await page.getByLabel("UOM type").fill("unit");
  await page.getByLabel("UOM creation reason").fill(`E2E UOM setup for ${marker}`);
  await page.getByRole("button", { name: "Create UOM" }).click({ force: true });
  await expect(page.getByTestId("uom-row").filter({ hasText: uomCode })).toBeVisible();
  await page.getByLabel("Item code").fill(itemCode);
  await page.getByLabel("Item name").fill(itemName);
  await page.locator('select[name="itemCategoryId"]').selectOption({ label: `${marker} Category` });
  await page.locator('select[name="baseUomId"]').selectOption({ label: uomCode });
  await page.getByLabel("Creation reason").first().fill(`E2E item setup for ${marker}`);
  await page.getByRole("button", { name: "Create Item" }).click({ force: true });
  await expect(page.getByTestId("item-row").filter({ hasText: itemCode })).toBeVisible();
  await page.locator('select[name="itemId"]').selectOption({ label: itemName });
  await page.locator('select[name="fromUomId"]').selectOption({ label: `From ${uomCode}` });
  await page.locator('select[name="toUomId"]').selectOption({ label: "To KG" });
  await page.getByLabel("Conversion factor").fill("1");
  await page.getByLabel("Conversion creation reason").fill(`E2E conversion setup for ${marker}`);
  await expect(page.getByRole("heading", { name: "Item Master" })).toBeVisible();
  await page
    .getByLabel("Conversion creation reason")
    .locator("xpath=ancestor::form[1]")
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page.getByTestId("conversion-row").filter({ hasText: itemName })).toBeVisible({
    timeout: 15000
  });

  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { name: "Suppliers" })).toBeVisible();
  await page
    .locator('select[name="supplierId"]')
    .selectOption({ label: "CONFIGURED-SUPPLIER / Configured Supplier" });
  await page.locator('select[name="itemId"]').selectOption({ label: `${itemName} / ${itemCode}` });
  await page.locator('select[name="purchaseUomId"]').selectOption({ label: `${uomCode} / ${marker} Unit` });
  const supplierSku = `SKU-${itemCode}`;
  await page.getByLabel("Supplier SKU").fill(supplierSku);
  await page.getByLabel("Supplier item name").fill(`${marker} Supplier Item`);
  await page.getByLabel("Lead days").fill("2");
  await page.getByLabel("Rank").fill("1");
  await page.getByLabel("MOQ").fill("1");
  await page.getByLabel("Reference price").fill("12.5");
  await page.getByLabel("Price effective from").fill("2026-07-01");
  await page.getByLabel("Link reason").fill(`E2E supplier item link for ${marker}`);
  await page.getByRole("button", { name: "Link Supplier Item" }).click({ force: true });
  const supplierItemLinkRow = page
    .getByTestId("supplier-row")
    .filter({ hasText: "CONFIGURED-SUPPLIER" })
    .getByTestId("supplier-item-link-row")
    .filter({ hasText: supplierSku });
  await expect(supplierItemLinkRow).toBeVisible();
  await supplierItemLinkRow
    .getByLabel("Link deactivation reason")
    .fill(`E2E supplier item link deactivation for ${marker}`);
  await supplierItemLinkRow.getByRole("button", { name: "Deactivate Link" }).click({ force: true });
  await expect(
    page
      .getByTestId("supplier-row")
      .filter({ hasText: "CONFIGURED-SUPPLIER" })
      .getByTestId("supplier-item-link-row")
      .filter({ hasText: supplierSku })
      .getByText("INACTIVE")
  ).toBeVisible();

  await signInAs(
    page,
    "Sign in as Requester",
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );
  const catalogMarker = `${marker} Catalog PR`;
  await page.getByLabel("Required date").fill("2026-07-16");
  await page.getByLabel("Urgency").fill("Normal");
  await page.getByLabel("Justification").fill(`Catalog item validation for ${marker}`);
  await page.getByLabel("Line description").fill(catalogMarker);
  await page.getByLabel("Catalog item").selectOption({ label: `${itemName} / ${itemCode}` });
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Catalog unit").selectOption({ label: `${uomCode} / ${marker} Unit` });
  await page.getByLabel("Purpose").fill("Branch operating requirement");
  await createDraftPurchaseRequest(page);
  await expect(page.getByRole("heading", { name: itemName })).toBeVisible();
  await expect(page.getByText(catalogMarker)).toBeVisible();
  await expect(page.getByText(`2 ${uomCode}`)).toBeVisible();

  await signInAs(page, "Sign in as Admin", adminEmail, "/items", "Item Master");
  await expect(page.getByRole("heading", { name: "Item Master" })).toBeVisible();
  const itemRow = page.getByTestId("item-row").filter({ hasText: itemCode });
  await itemRow.getByLabel("Item deactivation reason").fill(`E2E item deactivation for ${marker}`);
  await itemRow.getByRole("button", { name: "Deactivate Item" }).click({ force: true });
  await expect(page.getByTestId("item-row").filter({ hasText: itemCode }).getByText("INACTIVE")).toBeVisible();
  const categoryRow = page.getByTestId("item-category-row").filter({ hasText: categoryCode });
  await categoryRow.getByLabel("Category deactivation reason").fill(`E2E category deactivation for ${marker}`);
  await categoryRow.getByRole("button", { name: "Deactivate Category" }).click({ force: true });
  await expect(
    page.getByTestId("item-category-row").filter({ hasText: categoryCode }).getByText("INACTIVE")
  ).toBeVisible();
  const uomRow = page.getByTestId("uom-row").filter({ hasText: uomCode });
  await uomRow.getByLabel("UOM deactivation reason").fill(`E2E UOM deactivation for ${marker}`);
  await uomRow.getByRole("button", { name: "Deactivate UOM" }).click({ force: true });
  await expect(page.getByTestId("uom-row").filter({ hasText: uomCode }).getByText("INACTIVE")).toBeVisible();
  await page.goto("/admin");
  await page
    .getByTestId("admin-user-row")
    .filter({ hasText: "Configured Admin" })
    .getByRole("link", { name: "View Access" })
    .click();
  await expect(page.getByRole("heading", { name: "User Access" })).toBeVisible();
  await expect(page.getByText("Configured Admin / admin@example.test")).toBeVisible();
  await expect(page.getByText("CONFIGURED_ADMIN")).toBeVisible();
  await expect(page.getByText("Self protected").first()).toBeVisible();
  await gotoCoreAdmin(page);
  await page
    .getByTestId("admin-user-row")
    .filter({ hasText: "Configured User" })
    .getByRole("link", { name: "View Access" })
    .click();
  await expect(page.getByRole("heading", { name: "User Access" })).toBeVisible();
  await expect(page.getByText("Configured User / user@example.test")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Assign Location Scope" })).toBeVisible();
  await gotoCoreAdmin(page);
  await page
    .getByTestId("admin-user-row")
    .filter({ hasText: `Configured Scope Candidate ${testInfo.project.name}` })
    .getByRole("link", { name: "View Access" })
    .click();
  await expect(page.getByRole("heading", { name: "User Access" })).toBeVisible();
  await expect(page.getByText("No active roles are assigned.")).toBeVisible();
  await expect(page.getByText("No effective permissions from active roles.")).toBeVisible();
  await expect(page.getByText("No active scopes are assigned.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Assign Role" })).toBeVisible();
  await page.getByLabel("Role assignment reason").fill(`E2E role assignment for ${marker}`);
  await page
    .getByLabel("Role assignment reason")
    .locator("xpath=ancestor::form[1]")
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(
    page.getByTestId("admin-user-role-row").filter({ hasText: "Configured Requester" })
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("purchasing.purchase_request.create")).toBeVisible();
  await page.getByLabel("Role deactivation reason").fill(`E2E role deactivation for ${marker}`);
  await page
    .getByLabel("Role deactivation reason")
    .locator("xpath=ancestor::form[1]")
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page.getByText("No active roles are assigned.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign Role" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Assign Location Scope" })).toBeVisible();
  const assignScopeButton = page.getByRole("button", { name: "Assign Scope" });
  if ((await assignScopeButton.count()) > 0) {
    await page.getByLabel("Scope assignment reason").fill(`E2E scope assignment for ${marker}`);
    await page
      .getByLabel("Scope assignment reason")
      .locator("xpath=ancestor::form[1]")
      .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  }
  await expect(
    page.getByTestId("admin-user-scope-row").filter({ hasText: "LOCATION" }).filter({ hasText: "VIEW" })
  ).toBeVisible();
  await page.getByLabel("Deactivation reason").fill(`E2E scope deactivation for ${marker}`);
  await page
    .getByLabel("Deactivation reason")
    .locator("xpath=ancestor::form[1]")
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page.getByRole("button", { name: "Assign Scope" })).toBeVisible();
  await gotoCoreAdmin(page);
  await expect(page.getByText("core.administer")).toBeVisible();
  const roleAccessHref = await page
    .getByTestId("admin-role-row")
    .filter({ hasText: "Configured Admin" })
    .getByRole("link", { name: "View Role" })
    .getAttribute("href");
  expect(roleAccessHref).toBeTruthy();
  await page.goto(roleAccessHref ?? "/admin");
  await expect(page.getByRole("heading", { name: "Role Access" })).toBeVisible();
  await expect(page.getByText("Configured Admin / CONFIGURED_ADMIN")).toBeVisible();
  await expect(page.getByTestId("admin-role-permission-row").filter({ hasText: "core.administer" })).toBeVisible();
  await gotoCoreAdmin(page);
  await page.goto("/admin/permissions/00000000-0000-4000-8000-000000000016");
  await expect(page.getByRole("heading", { name: "Permission Access" })).toBeVisible();
  await expect(page.getByTestId("admin-permission-role-row").filter({ hasText: "Configured Admin" })).toBeVisible();
  await gotoCoreAdmin(page);
  await page.goto("/admin/companies/00000000-0000-4000-8000-000000000002");
  await expect(page.getByRole("heading", { name: "Company Context" })).toBeVisible();
  await expect(page.getByTestId("admin-company-user-row").filter({ hasText: "Configured Admin" })).toBeVisible();
  await expect(page.getByTestId("admin-company-location-row").filter({ hasText: "Configured Location" })).toBeVisible();
  await gotoCoreAdmin(page);
  await page.goto("/admin/approval-rules/00000000-0000-4000-8000-000000000010");
  await expect(page.getByRole("heading", { name: "Approval Rule" })).toBeVisible();
  await expect(page.getByTestId("admin-rule-step-row").filter({ hasText: "Configured Approver" })).toBeVisible();
  await gotoCoreAdmin(page);
  await page.goto("/admin/locations/00000000-0000-4000-8000-000000000004");
  await expect(page.getByRole("heading", { name: "Location Context" })).toBeVisible();
  await expect(page.getByText("Configured Company / Configured Brand / Configured Location")).toBeVisible();
  await expect(page.getByTestId("admin-location-user-row").filter({ hasText: "Configured Admin" })).toBeVisible();
  await gotoCoreAdmin(page);
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "purchase_request.approved" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "user_scope_assignment.deactivated" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "user_role_assignment.deactivated" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "supplier.created" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "supplier_quote.created" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "supplier.deactivated" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "item.created" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "item_uom_conversion.created" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "item.deactivated" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "item_category.deactivated" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "uom.deactivated" }).first()
  ).toBeVisible();
  await gotoAuditEvent(page, "user_scope_assignment.deactivated");
  await gotoCoreAdmin(page);
  await gotoAuditEvent(page, "purchase_request.approved");
});
