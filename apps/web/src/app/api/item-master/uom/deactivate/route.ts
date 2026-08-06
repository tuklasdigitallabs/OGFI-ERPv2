import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { deactivateUom } from "@/server/services/items";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, { mutate: deactivateUom, successCode: "UOM_DEACTIVATED", revalidate: "/items" });
}
