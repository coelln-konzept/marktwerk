import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { devAutoLoginAccount, safeNext } from "@/server/dev-auto-login";

/**
 * Local development only (see `server/dev-auto-login.ts`): signs in the configured account and
 * continues to `next`. Like `/api/auth`, this is a sign-in endpoint, so there is no
 * `requireUser()`; anywhere it isn't enabled it answers 404.
 */
export async function GET(request: NextRequest) {
  const account = devAutoLoginAccount(request.headers.get("host"));
  if (!account) return new NextResponse(null, { status: 404 });

  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const signIn = await auth.api.signInEmail({
    body: account,
    headers: request.headers,
    asResponse: true,
  });
  if (!signIn.ok) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  for (const cookie of signIn.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
  return response;
}
