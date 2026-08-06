import { NextResponse, type NextRequest } from "next/server";
import { getActionFeedback, getActionSuccessFeedback } from "@/server/services/actionFeedback";
import { getSessionContext } from "@/server/services/context";
import { isTrustedShortMutationOrigin } from "@/server/http/shortMutationRoute";

export async function POST(request: NextRequest) {
  if (!isTrustedShortMutationOrigin(request)) {
    return NextResponse.json(
      { status: "error", feedback: getActionFeedback({ error: "ORIGIN_DENIED" }) },
      { status: 403 },
    );
  }

  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json(
      { status: "error", feedback: getActionFeedback({ error: "AUTHENTICATION_REQUIRED" }) },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const requestedLocationId = String(formData.get("locationId") ?? "");
  const location = session.authorizedLocations.find(
    (candidate) => candidate.locationId === requestedLocationId,
  );
  if (!location) {
    return NextResponse.json(
      { status: "error", feedback: getActionFeedback({ error: "LOCATION_SCOPE_DENIED" }) },
      { status: 403 },
    );
  }

  const response = NextResponse.json(
    { status: "success", feedback: getActionSuccessFeedback("LOCATION_CONTEXT_SWITCHED") },
    { headers: { "cache-control": "no-store" } },
  );
  response.cookies.set("ogfi_demo_location", location.locationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
