import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { createOperationalReasonCode } from "@/server/services/operationalReasonCodes";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, {
    mutate: createOperationalReasonCode,
    successCode: "OPERATIONAL_REASON_CODE_CREATED",
    revalidate: "/admin/reason-codes",
  });
}
