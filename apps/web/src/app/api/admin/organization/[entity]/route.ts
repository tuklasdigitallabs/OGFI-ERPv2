import { NextResponse, type NextRequest } from "next/server";
import { getActionFeedback } from "@/server/services/actionFeedback";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import {
  updateCoreAdminBrand,
  updateCoreAdminCompany,
  updateCoreAdminDepartment,
  updateCoreAdminLocation
} from "@/server/services/coreAdmin";

const organizationEntities = ["company", "brand", "department", "location"] as const;
type OrganizationEntity = (typeof organizationEntities)[number];

const updateHandlers: Record<OrganizationEntity, { successCode: string; update: (formData: FormData) => Promise<unknown> }> = {
  company: { successCode: "CORE_ADMIN_COMPANY_UPDATED", update: updateCoreAdminCompany },
  brand: { successCode: "CORE_ADMIN_BRAND_UPDATED", update: updateCoreAdminBrand },
  department: { successCode: "CORE_ADMIN_DEPARTMENT_UPDATED", update: updateCoreAdminDepartment },
  location: { successCode: "CORE_ADMIN_LOCATION_UPDATED", update: updateCoreAdminLocation }
};

export async function POST(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  if (!organizationEntities.includes(entity as OrganizationEntity)) {
    return NextResponse.json({ status: "error", feedback: getActionFeedback({ error: "ACTION_FAILED" }) }, { status: 404 });
  }
  const handler = updateHandlers[entity as OrganizationEntity];
  return shortMutationResponse(request, { mutate: handler.update, successCode: handler.successCode, revalidate: "/admin" });
}
