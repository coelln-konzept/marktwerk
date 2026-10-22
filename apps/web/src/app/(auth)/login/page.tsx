import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEV_AUTO_LOGIN_OPT_OUT,
  DEV_AUTO_LOGIN_PATH,
  devAutoLoginAccount,
  safeNext,
} from "@/server/dev-auto-login";
import { getCurrentUser } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { next, auto } = await searchParams;
  // Local development: also lands here with a stale session cookie (e.g. after a reseed), which the
  // proxy can't tell from a valid one. `auto=0` marks a failed attempt, so this never loops.
  if (
    auto !== "0" &&
    devAutoLoginAccount((await headers()).get("host")) &&
    !(await cookies()).has(DEV_AUTO_LOGIN_OPT_OUT)
  ) {
    const target = safeNext(typeof next === "string" ? next : null);
    redirect(`${DEV_AUTO_LOGIN_PATH}?next=${encodeURIComponent(target)}` as never);
  }
  const t = await getTranslations();

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t("app.name")}</CardTitle>
          <CardDescription>{t("app.tagline")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={typeof next === "string" && next.startsWith("/") ? next : "/"} />
        </CardContent>
      </Card>
    </main>
  );
}
