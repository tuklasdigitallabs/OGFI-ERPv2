import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { createCoreAdminRole } from "@/server/services/coreAdmin";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, {
    mutate: createCoreAdminRole,
    successCode: "CORE_ADMIN_ROLE_CREATED",
    revalidate: "/admin",
  });
}
