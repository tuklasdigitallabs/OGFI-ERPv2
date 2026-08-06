import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { updateUom } from "@/server/services/items";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, { mutate: updateUom, successCode: "UOM_UPDATED", revalidate: "/items" });
}
