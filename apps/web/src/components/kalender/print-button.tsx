"use client";

import { Printer } from "lucide-react";

/** "Drucken": the browser's print dialog (the Jahresübersicht prints on one A4 landscape page). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Printer aria-hidden className="size-4" />
      {label}
    </button>
  );
}
