import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getActionErrorCode, getActionFeedback, getActionSuccessFeedback } from "@/server/services/actionFeedback";
import { isTrustedMutationOrigin } from "@/server/services/authentication";

export function isTrustedShortMutationOrigin(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  const requestUrl = host ? `${protocol}://${host}/` : request.url;
  return isTrustedMutationOrigin({ origin: request.headers.get("origin"), requestUrl, appUrl: process.env.APP_URL });
}

export async function shortMutationResponse(
  request: NextRequest,
  options: { successCode: string; mutate: (formData: FormData) => Promise<unknown>; revalidate?: string }
) {
  if (!isTrustedShortMutationOrigin(request)) {
    return NextResponse.json({ status: "error", feedback: getActionFeedback({ error: "ORIGIN_DENIED" }) }, { status: 403 });
  }
  try {
    await options.mutate(await request.formData());
  } catch (error) {
    return NextResponse.json({ status: "error", feedback: getActionFeedback({ error: getActionErrorCode(error) }) }, { status: 400 });
  }
  if (options.revalidate) revalidatePath(options.revalidate);
  return NextResponse.json({ status: "success", feedback: getActionSuccessFeedback(options.successCode) }, { headers: { "cache-control": "no-store" } });
}
