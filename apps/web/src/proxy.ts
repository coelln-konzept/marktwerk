import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import {
  DEV_AUTO_LOGIN_OPT_OUT,
  DEV_AUTO_LOGIN_PATH,
  devAutoLoginAccount,
} from "./server/dev-auto-login";

/**
 * Optimistic redirect only: checks that a session cookie exists. Real
 * authorization happens in requireUser()/requirePermission() on the server.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    // Local development: sign in the configured account instead of showing the login page.
    if (
      devAutoLoginAccount(request.headers.get("host")) &&
      !request.cookies.has(DEV_AUTO_LOGIN_OPT_OUT)
    ) {
      const url = new URL(DEV_AUTO_LOGIN_PATH, request.url);
      url.searchParams.set("next", next);
      return NextResponse.redirect(url);
    }
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes (they authorise themselves), login, static files and Next internals.
  matcher: [
    "/((?!api/|login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|ico)$).*)",
  ],
};
