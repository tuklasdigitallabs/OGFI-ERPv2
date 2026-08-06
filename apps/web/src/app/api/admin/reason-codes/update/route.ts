import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { updateOperationalReasonCode } from "@/server/services/operationalReasonCodes";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, {
    mutate: updateOperationalReasonCode,
    successCode: "OPERATIONAL_REASON_CODE_UPDATED",
    revalidate: "/admin/reason-codes",
  });
}
