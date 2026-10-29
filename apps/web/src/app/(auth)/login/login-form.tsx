"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOCALE_COOKIE } from "@/i18n/config";
import { authClient } from "@/lib/auth-client";
import { restoreDisplayPreferences } from "./actions";

type LoginError = "credentials" | "origin" | "banned" | "rateLimit" | "unknown";

const ERROR_KEYS = {
  credentials: "error",
  origin: "errorOrigin",
  banned: "errorBanned",
  rateLimit: "errorRateLimit",
  unknown: "errorUnknown",
} as const satisfies Record<LoginError, string>;

/** Maps a Better Auth error so a blocked address or server fault doesn't read as a wrong password. */
function classifyError(error: { code?: string; status?: number } | null): LoginError {
  if (error?.code === "INVALID_EMAIL_OR_PASSWORD") return "credentials";
  if (error?.code === "INVALID_ORIGIN") return "origin";
  if (error?.code === "BANNED_USER") return "banned";
  if (error?.status === 429) return "rateLimit";
  return "unknown";
}

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("login");
  const router = useRouter();
  const [error, setError] = useState<LoginError | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error || !data) {
      setError(classifyError(error));
      setPending(false);
      return;
    }
    // Use the language stored on the user's profile from now on.
    const locale = (data.user as { locale?: string }).locale ?? "de";
    // biome-ignore lint/suspicious/noDocumentCookie: simple client-side preference cookie
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    await restoreDisplayPreferences();
    router.replace(next as never);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(ERROR_KEYS[error])}
        </p>
      )}
      <Button type="submit" variant="default" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
