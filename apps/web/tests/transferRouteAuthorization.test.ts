import { describe, expect, it } from "vitest";
import { POST as postReceipt } from "@/app/api/transfers/[id]/receipt/route";
import { POST as postReversal } from "@/app/api/transfers/[id]/reversal/route";

function request(path: string, origin: string, fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request(`http://127.0.0.1:3002${path}`, {
    method: "POST",
    headers: {
      origin,
      host: "127.0.0.1:3002",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

describe("transfer mutation route authorization boundaries", () => {
  it("AUTHZ-TRANSFER-RECEIPT-ROUTE-001 rejects an untrusted origin before mutation", async () => {
    const response = await postReceipt(
      request("/api/transfers/transfer-1/receipt", "https://attacker.example", {
        id: "transfer-1",
        idempotencyKey: "route-test",
      }) as never,
      { params: Promise.resolve({ id: "transfer-1" }) },
    );
    expect(response.status).toBe(403);
  });

  it("AUTHZ-TRANSFER-REVERSAL-ROUTE-001 rejects a transfer-id mismatch before mutation", async () => {
    const response = await postReversal(
      request("/api/transfers/transfer-1/reversal", "http://127.0.0.1:3002", {
        id: "different-transfer",
        receiptId: "receipt-1",
      }) as never,
      { params: Promise.resolve({ id: "transfer-1" }) },
    );
    expect(response.status).toBe(403);
  });
});
