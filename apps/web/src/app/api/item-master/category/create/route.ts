import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { createItemCategory } from "@/server/services/items";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, {
    mutate: createItemCategory,
    successCode: "ITEM_CATEGORY_CREATED",
    revalidate: "/items"
  });
}
