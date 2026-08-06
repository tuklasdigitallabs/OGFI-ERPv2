import { NextResponse, type NextRequest } from "next/server";
import { getActionFeedback } from "@/server/services/actionFeedback";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import {
  createCoreAdminBrand,
  createCoreAdminCompany,
  createCoreAdminDepartment,
  createCoreAdminLocation
} from "@/server/services/coreAdmin";

const organizationEntities = ["company", "brand", "department", "location"] as const;
type OrganizationEntity = (typeof organizationEntities)[number];

const createHandlers: Record<OrganizationEntity, { successCode: string; create: (formData: FormData) => Promise<unknown> }> = {
  company: { successCode: "CORE_ADMIN_COMPANY_CREATED", create: createCoreAdminCompany },
  brand: { successCode: "CORE_ADMIN_BRAND_CREATED", create: createCoreAdminBrand },
  department: { successCode: "CORE_ADMIN_DEPARTMENT_CREATED", create: createCoreAdminDepartment },
  location: { successCode: "CORE_ADMIN_LOCATION_CREATED", create: createCoreAdminLocation }
};

export async function POST(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  if (!organizationEntities.includes(entity as OrganizationEntity)) {
    return NextResponse.json({ status: "error", feedback: getActionFeedback({ error: "ACTION_FAILED" }) }, { status: 404 });
  }
  const handler = createHandlers[entity as OrganizationEntity];
  return shortMutationResponse(request, { mutate: handler.create, successCode: handler.successCode, revalidate: "/admin" });
}
