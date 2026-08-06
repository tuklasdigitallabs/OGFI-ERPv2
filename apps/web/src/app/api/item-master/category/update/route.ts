import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { updateItemCategory } from "@/server/services/items";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, { mutate: updateItemCategory, successCode: "ITEM_CATEGORY_UPDATED", revalidate: "/items" });
}
