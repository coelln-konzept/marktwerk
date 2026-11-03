"use client";

import "@fontsource-variable/inter";
import { useEffect } from "react";
import messages from "../../messages/de/shell.json";
import "./globals.css";

/**
 * Last resort: the root layout itself failed, so there is no shell, no translation provider and no
 * locale cookie reader here. German-first (the strings still live in messages/de/shell.json).
 * Follows the OS colour scheme, as Next's own error page does.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = messages.errors;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="de" data-theme="system">
      <body>
        <title>{t.failedTitle}</title>
        <main
          role="alert"
          className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center"
        >
          <h1 className="font-semibold text-[22px] tracking-tight">{t.failedTitle}</h1>
          <p className="max-w-[48ch] text-muted-foreground">{t.failedHint}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex min-h-8 cursor-pointer items-center rounded-lg border border-primary bg-primary px-3 font-medium text-primary-foreground hover:bg-primary-hover"
            >
              {t.retry}
            </button>
            {/* A plain link on purpose: a full page load gets the app out of the broken state. */}
            <a
              href="/"
              className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
            >
              {t.back}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
