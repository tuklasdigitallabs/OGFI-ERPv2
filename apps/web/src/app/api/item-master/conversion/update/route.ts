import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { updateItemUomConversion } from "@/server/services/items";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, { mutate: updateItemUomConversion, successCode: "UOM_CONVERSION_UPDATED", revalidate: "/items" });
}
