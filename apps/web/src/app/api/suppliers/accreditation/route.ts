import { type NextRequest } from "next/server";
import { shortMutationResponse } from "@/server/http/shortMutationRoute";
import { updateSupplierAccreditation } from "@/server/services/suppliers";

export async function POST(request: NextRequest) {
  return shortMutationResponse(request, { mutate: updateSupplierAccreditation, successCode: "SUPPLIER_ACCREDITATION_UPDATED", revalidate: "/suppliers" });
}
