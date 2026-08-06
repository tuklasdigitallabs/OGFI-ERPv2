import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { createUom } from "@/server/services/items";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, {
    mutate: createUom,
    successCode: "UOM_CREATED",
    revalidate: "/items"
  });
}
