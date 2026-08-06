import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { createSupplier } from "@/server/services/suppliers";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, {
    mutate: createSupplier,
    successCode: "SUPPLIER_CREATED",
    revalidate: "/suppliers"
  });
}
