import { NextResponse, type NextRequest } from "next/server";
import {
  isTrustedMutationOrigin,
  signOutCurrentSession,
} from "@/server/services/authentication";

const sessionCookieNames = [
  "ogfi_demo_session",
  "ogfi_demo_session_issued_at",
  "ogfi_demo_location"
] as const;

async function signOut(request: NextRequest) {
  await signOutCurrentSession();
  const response = NextResponse.redirect(new URL("/sign-in", request.url));

  for (const cookieName of sessionCookieNames) {
    response.cookies.delete(cookieName);
  }

  return response;
}

export function GET() {
  return NextResponse.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (
    !isTrustedMutationOrigin({
      origin,
      requestUrl: request.url,
      appUrl: process.env.APP_URL,
    })
  ) {
    return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  }
  return signOut(request);
}
