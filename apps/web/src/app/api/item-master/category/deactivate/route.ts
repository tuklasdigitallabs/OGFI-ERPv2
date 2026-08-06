import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { deactivateItemCategory } from "@/server/services/items";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, { mutate: deactivateItemCategory, successCode: "ITEM_CATEGORY_DEACTIVATED", revalidate: "/items" });
}
