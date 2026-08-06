import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { deactivateOperationalReasonCode } from "@/server/services/operationalReasonCodes";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, {
    mutate: deactivateOperationalReasonCode,
    successCode: "OPERATIONAL_REASON_CODE_DEACTIVATED",
    revalidate: "/admin/reason-codes",
  });
}
