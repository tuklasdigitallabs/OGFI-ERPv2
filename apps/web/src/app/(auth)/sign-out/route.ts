import { NextResponse, type NextRequest } from "next/server";

const sessionCookieNames = [
  "ogfi_demo_session",
  "ogfi_demo_session_issued_at",
  "ogfi_demo_location"
] as const;

function signOut(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/sign-in", request.url));

  for (const cookieName of sessionCookieNames) {
    response.cookies.delete(cookieName);
  }

  return response;
}

export function GET(request: NextRequest) {
  return signOut(request);
}

export function POST(request: NextRequest) {
  return signOut(request);
}
