import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { deactivateSupplier } from "@/server/services/suppliers";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, { mutate: deactivateSupplier, successCode: "SUPPLIER_DEACTIVATED", revalidate: "/suppliers" });
}
