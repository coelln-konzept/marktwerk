import "@fontsource-variable/inter";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { getDisplayPreferences } from "@/server/preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "marktwerk", template: "%s · marktwerk" },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const { theme, density } = await getDisplayPreferences();
  return (
    // suppressHydrationWarning: browser extensions (e.g. LanguageTool) add attributes to <html>
    // before React hydrates. In dev, Next counts that mismatch as a runtime error and then does a
    // full reload instead of a soft refresh on server changes. Only covers <html>'s own attributes.
    <html lang={locale} data-theme={theme} data-density={density} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
