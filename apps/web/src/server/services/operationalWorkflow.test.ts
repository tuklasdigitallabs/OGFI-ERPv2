import { describe, expect, it, vi } from "vitest";
import { recordOperationalStatusTransition } from "./operationalWorkflow";

describe("operational workflow transition ledger", () => {
  it("records scoped status transitions with an idempotency key", async () => {
    const create = vi.fn();
    const tx = {
      operationalStatusTransition: {
        create
      }
    } as never;
    const session = {
      user: { id: "user-1" },
      context: {
        tenantId: "tenant-1",
        companyId: "company-1",
        brandId: "brand-1",
        locationId: "location-1"
      }
    } as never;

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "FoodSafetyLog",
      targetEntityId: "record-1",
      action: "REVIEW",
      fromStatus: "SUBMITTED",
      toStatus: "EXCEPTION_OPEN",
      reason: "Temperature exception requires corrective action.",
      evidenceReference: "PHOTO-123"
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        companyId: "company-1",
        brandId: "brand-1",
        locationId: "location-1",
        targetEntityType: "FoodSafetyLog",
        targetEntityId: "record-1",
        action: "REVIEW",
        fromStatus: "SUBMITTED",
        toStatus: "EXCEPTION_OPEN",
        actorUserId: "user-1",
        reason: "Temperature exception requires corrective action.",
        evidenceReference: "PHOTO-123",
        idempotencyKey:
          "FoodSafetyLog:record-1:REVIEW:SUBMITTED:EXCEPTION_OPEN"
      }
    });
  });

  it("does not require old transaction mocks to provide the new ledger delegate", async () => {
    await expect(
      recordOperationalStatusTransition({} as never, {
        user: { id: "user-1" },
        context: {
          tenantId: "tenant-1",
          companyId: "company-1",
          brandId: "brand-1",
          locationId: "location-1"
        }
      } as never, {
        targetEntityType: "MaintenanceTicket",
        targetEntityId: "record-2",
        action: "CANCEL",
        fromStatus: "OPEN",
        toStatus: "CANCELLED"
      })
    ).resolves.toBeUndefined();
  });

  it("requires transition storage for controlled correction operations", async () => {
    await expect(
      recordOperationalStatusTransition({} as never, {
        user: { id: "user-1" },
        context: {
          tenantId: "tenant-1",
          companyId: "company-1",
          brandId: "brand-1",
          locationId: "location-1"
        }
      } as never, {
        targetEntityType: "FoodSafetyLog",
        targetEntityId: "record-3",
        action: "APPLY_CORRECTION",
        fromStatus: "RETURNED",
        toStatus: "SUBMITTED",
        required: true
      })
    ).rejects.toThrow("OPERATIONAL_STATUS_TRANSITION_WRITE_REQUIRED");
  });

  it("treats an idempotency-key collision as an already-recorded transition", async () => {
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    await expect(
      recordOperationalStatusTransition(
        { operationalStatusTransition: { create } } as never,
        {
          user: { id: "user-1" },
          context: {
            tenantId: "tenant-1",
            companyId: "company-1",
            brandId: "brand-1",
            locationId: "location-1"
          }
        } as never,
        {
          targetEntityType: "FoodSafetyLog",
          targetEntityId: "record-4",
          action: "APPLY_CORRECTION",
          fromStatus: "RETURNED",
          toStatus: "SUBMITTED",
          idempotencyKey: "food-safety-correction-v1",
          required: true
        }
      )
    ).resolves.toBeUndefined();
  });
});
