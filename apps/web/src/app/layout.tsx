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
    <html lang={locale} data-theme={theme} data-density={density}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
