import { NextResponse, type NextRequest } from "next/server";
import { getActionErrorCode, getActionFeedback } from "@/server/services/actionFeedback";
import { isTrustedMutationOrigin } from "@/server/services/authentication";
import { reverseInventoryTransferReceipt } from "@/server/services/transfers";

function denied() {
  return NextResponse.json({ status: "error", message: "The action could not be completed from this request." }, { status: 403 });
}

function originIsTrusted(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  const requestUrl = host ? `${protocol}://${host}/` : request.url;
  return isTrustedMutationOrigin({ origin: request.headers.get("origin"), requestUrl, appUrl: process.env.APP_URL });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!originIsTrusted(request)) return denied();
  const { id } = await context.params;
  const formData = await request.formData();
  if (String(formData.get("id") ?? "") !== id) return denied();
  try {
    await reverseInventoryTransferReceipt(formData);
  } catch (error) {
    const code = getActionErrorCode(error);
    return NextResponse.json({ status: "error", message: getActionFeedback({ error: code })?.message ?? "The receipt reversal was not posted. Review the form and try again." }, { status: 400 });
  }
  return NextResponse.json({ status: "success" }, { status: 200, headers: { "cache-control": "no-store" } });
}
