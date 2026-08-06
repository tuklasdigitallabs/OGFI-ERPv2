import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isTrustedMutationOrigin: vi.fn(),
  getSessionContext: vi.fn(),
  createCoreAdminBrand: vi.fn(),
  createCoreAdminCompany: vi.fn(),
  createCoreAdminDepartment: vi.fn(),
  createCoreAdminLocation: vi.fn(),
  updateCoreAdminBrand: vi.fn(),
  updateCoreAdminCompany: vi.fn(),
  updateCoreAdminDepartment: vi.fn(),
  updateCoreAdminLocation: vi.fn(),
  createOperationalReasonCode: vi.fn(),
  deactivateOperationalReasonCode: vi.fn(),
  updateOperationalReasonCode: vi.fn(),
  createItemCategory: vi.fn(),
  deactivateItemCategory: vi.fn(),
  updateItemCategory: vi.fn(),
  updateItemUomConversion: vi.fn(),
  createUom: vi.fn(),
  deactivateUom: vi.fn(),
  updateUom: vi.fn(),
  createSupplier: vi.fn(),
  deactivateSupplier: vi.fn(),
  updateSupplierAccreditation: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/services/authentication", () => ({
  isTrustedMutationOrigin: mocks.isTrustedMutationOrigin,
}));
vi.mock("@/server/services/context", () => ({
  getSessionContext: mocks.getSessionContext,
}));
vi.mock("@/server/services/coreAdmin", () => ({
  createCoreAdminBrand: mocks.createCoreAdminBrand,
  createCoreAdminCompany: mocks.createCoreAdminCompany,
  createCoreAdminDepartment: mocks.createCoreAdminDepartment,
  createCoreAdminLocation: mocks.createCoreAdminLocation,
  updateCoreAdminBrand: mocks.updateCoreAdminBrand,
  updateCoreAdminCompany: mocks.updateCoreAdminCompany,
  updateCoreAdminDepartment: mocks.updateCoreAdminDepartment,
  updateCoreAdminLocation: mocks.updateCoreAdminLocation,
}));
vi.mock("@/server/services/operationalReasonCodes", () => ({
  createOperationalReasonCode: mocks.createOperationalReasonCode,
  deactivateOperationalReasonCode: mocks.deactivateOperationalReasonCode,
  updateOperationalReasonCode: mocks.updateOperationalReasonCode,
}));
vi.mock("@/server/services/items", () => ({
  createItemCategory: mocks.createItemCategory,
  deactivateItemCategory: mocks.deactivateItemCategory,
  updateItemCategory: mocks.updateItemCategory,
  updateItemUomConversion: mocks.updateItemUomConversion,
  createUom: mocks.createUom,
  deactivateUom: mocks.deactivateUom,
  updateUom: mocks.updateUom,
}));
vi.mock("@/server/services/suppliers", () => ({
  createSupplier: mocks.createSupplier,
  deactivateSupplier: mocks.deactivateSupplier,
  updateSupplierAccreditation: mocks.updateSupplierAccreditation,
}));

import { POST as updateOrganization } from "@/app/api/admin/organization/[entity]/route";
import { POST as createOrganization } from "@/app/api/admin/organization/create/[entity]/route";
import { POST as createReasonCode } from "@/app/api/admin/reason-codes/create/route";
import { POST as deactivateReasonCode } from "@/app/api/admin/reason-codes/deactivate/route";
import { POST as updateReasonCode } from "@/app/api/admin/reason-codes/update/route";
import { POST as switchLocation } from "@/app/api/context/location/route";
import { POST as createCategory } from "@/app/api/item-master/category/create/route";
import { POST as deactivateCategory } from "@/app/api/item-master/category/deactivate/route";
import { POST as updateCategory } from "@/app/api/item-master/category/update/route";
import { POST as updateConversion } from "@/app/api/item-master/conversion/update/route";
import { POST as createUom } from "@/app/api/item-master/uom/create/route";
import { POST as deactivateUom } from "@/app/api/item-master/uom/deactivate/route";
import { POST as updateUom } from "@/app/api/item-master/uom/update/route";
import { POST as updateSupplierAccreditation } from "@/app/api/suppliers/accreditation/route";
import { POST as createSupplier } from "@/app/api/suppliers/create/route";
import { POST as deactivateSupplier } from "@/app/api/suppliers/deactivate/route";

function hostileRequest(path: string) {
  return new Request(`http://127.0.0.1:3001${path}`, {
    method: "POST",
    headers: {
      origin: "https://attacker.example",
      host: "127.0.0.1:3001",
    },
    body: new FormData(),
  });
}

const delegatedServiceSpies = Object.entries(mocks).filter(
  ([name]) => name !== "isTrustedMutationOrigin",
);

describe("short mutation route authorization boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTrustedMutationOrigin.mockReturnValue(false);
  });

  it("AUTHZ-SHORT-MUTATION-ROUTES-ORIGIN-DENIAL-NO-MUTATION rejects every hostile Origin before session or domain service invocation", async () => {
    const routeCases: Array<{ label: string; invoke: () => Promise<Response> }> = [
      {
        label: "organization update",
        invoke: () => updateOrganization(hostileRequest("/api/admin/organization/company") as never, {
          params: Promise.resolve({ entity: "company" }),
        }),
      },
      {
        label: "organization create",
        invoke: () => createOrganization(hostileRequest("/api/admin/organization/create/company") as never, {
          params: Promise.resolve({ entity: "company" }),
        }),
      },
      { label: "reason-code create", invoke: () => createReasonCode(hostileRequest("/api/admin/reason-codes/create") as never) },
      { label: "reason-code deactivate", invoke: () => deactivateReasonCode(hostileRequest("/api/admin/reason-codes/deactivate") as never) },
      { label: "reason-code update", invoke: () => updateReasonCode(hostileRequest("/api/admin/reason-codes/update") as never) },
      { label: "location context", invoke: () => switchLocation(hostileRequest("/api/context/location") as never) },
      { label: "category create", invoke: () => createCategory(hostileRequest("/api/item-master/category/create") as never) },
      { label: "category deactivate", invoke: () => deactivateCategory(hostileRequest("/api/item-master/category/deactivate") as never) },
      { label: "category update", invoke: () => updateCategory(hostileRequest("/api/item-master/category/update") as never) },
      { label: "conversion update", invoke: () => updateConversion(hostileRequest("/api/item-master/conversion/update") as never) },
      { label: "UOM create", invoke: () => createUom(hostileRequest("/api/item-master/uom/create") as never) },
      { label: "UOM deactivate", invoke: () => deactivateUom(hostileRequest("/api/item-master/uom/deactivate") as never) },
      { label: "UOM update", invoke: () => updateUom(hostileRequest("/api/item-master/uom/update") as never) },
      { label: "supplier accreditation", invoke: () => updateSupplierAccreditation(hostileRequest("/api/suppliers/accreditation") as never) },
      { label: "supplier create", invoke: () => createSupplier(hostileRequest("/api/suppliers/create") as never) },
      { label: "supplier deactivate", invoke: () => deactivateSupplier(hostileRequest("/api/suppliers/deactivate") as never) },
    ];

    for (const routeCase of routeCases) {
      const response = await routeCase.invoke();
      expect(response.status, routeCase.label).toBe(403);
      expect(await response.json(), routeCase.label).toMatchObject({
        status: "error",
        feedback: { code: "ORIGIN_DENIED" },
      });
    }

    for (const [name, spy] of delegatedServiceSpies) {
      expect(spy, name).not.toHaveBeenCalled();
    }
  });
});
