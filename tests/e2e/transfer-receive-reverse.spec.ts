import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../../packages/database/src/client";

const receiverEmail = "systems.admin@ogfi.example";
const reverserEmail = process.env.DEMO_SUPER_USER_EMAIL ?? "super.admin@ogfi.example";
const tenantId = "00000000-0000-4000-8000-000000000001";
const companyId = "00000000-0000-4000-8000-000000000002";
const branchLocationId = "00000000-0000-4000-8000-000000000004";
const warehouseLocationId = "00000000-0000-4000-8000-000000000049";
const branchInventoryLocationId = "00000000-0000-4000-8000-000000000039";
const warehouseInventoryLocationId = "00000000-0000-4000-8000-000000000050";
const adminUserId = "00000000-0000-4000-8000-000000000014";
const itemId = "00000000-0000-4000-8000-000000000024";
const uomId = "00000000-0000-4000-8000-000000000022";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();
}

async function seedDispatchedTransfer() {
  const transferId = randomUUID();
  const lineId = randomUUID();
  const publicReference = `E2E-TR-${transferId.slice(0, 8).toUpperCase()}`;
  await prisma.inventoryTransfer.create({
    data: {
      id: transferId,
      tenantId,
      companyId,
      publicReference,
      sourceLocationId: warehouseLocationId,
      destinationLocationId: branchLocationId,
      requestedByUserId: adminUserId,
      dispatchedByUserId: adminUserId,
      transferType: "WAREHOUSE_TO_BRANCH",
      purpose: "Authenticated browser receive and reversal acceptance",
      status: "DISPATCHED",
      submittedAt: new Date(),
      dispatchedAt: new Date(),
      lines: {
        create: {
          id: lineId,
          tenantId,
          companyId,
          sourceInventoryLocationId: warehouseInventoryLocationId,
          destinationInventoryLocationId: branchInventoryLocationId,
          itemId,
          uomId,
          lineNumber: 1,
          description: "Browser acceptance transfer line",
          requestedQty: 2,
          approvedQty: 2,
          preparedQty: 2,
          dispatchedQty: 2,
          lotNumber: "E2E-LOT-1",
          expiryDate: new Date("2027-12-31T00:00:00.000Z")
        }
      }
    }
  });
  return { transferId, lineId };
}

test("authorized destination can receive and reverse a transfer receipt without duplicate stock", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { transferId, lineId } = await seedDispatchedTransfer();
  await signIn(page, receiverEmail);

  await page.goto(`/transfers/${transferId}`);
  await expect(page.getByRole("heading", { name: /Transfer Request/ })).toBeVisible();
  await expect(page.getByText("DISPATCHED", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Receive Transfer" }).click();
  await expect(page.getByRole("heading", { name: "Receive Transfer" })).toBeVisible();
  await page.getByRole("button", { name: "Post Receipt" }).click();

  await expect(page.getByText("RECEIVED", { exact: true })).toBeVisible();
  await expect(page.getByText("POSTED", { exact: true })).toBeVisible();
  const postedReceipt = await prisma.inventoryTransferReceipt.findFirstOrThrow({
    where: { inventoryTransferId: transferId, status: "POSTED" }
  });
  const receiveMovementCount = await prisma.inventoryMovement.count({
    where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: transferId, movementType: "TRANSFER_IN" }
  });
  expect(receiveMovementCount).toBe(1);

  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, reverserEmail);
  await page.goto(`/transfers/${transferId}`);
  await page.getByRole("button", { name: "Reverse Receipt" }).click();
  await page.getByLabel("Reversal reason").fill("Browser acceptance reversal");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reverse Receipt", exact: true }).last().click();

  await expect(page.getByText("DISPATCHED", { exact: true })).toBeVisible();
  await expect(page.getByText("REVERSED", { exact: true })).toBeVisible();
  const reversedReceipt = await prisma.inventoryTransferReceipt.findUniqueOrThrow({ where: { id: postedReceipt.id } });
  expect(reversedReceipt.status).toBe("REVERSED");
  const movements = await prisma.inventoryMovement.findMany({
    where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: transferId, sourceDocumentLineId: lineId },
    orderBy: { createdAt: "asc" }
  });
  expect(movements).toHaveLength(2);
  expect(movements.map((movement) => movement.movementType)).toEqual(["TRANSFER_IN", "REVERSAL"]);
  expect(movements[1]?.reversalOfMovementId).toBe(movements[0]?.id);
  const balance = await prisma.inventoryBalance.findUnique({
    where: { inventoryLocationId_itemId_lotKey: { inventoryLocationId: branchInventoryLocationId, itemId, lotKey: "UNTRACKED" } }
  });
  expect(Number(balance?.qtyOnHand ?? 0)).toBe(0);
});
