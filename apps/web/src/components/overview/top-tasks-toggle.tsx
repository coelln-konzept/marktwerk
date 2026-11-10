"use client";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/** "Top-5-Aufgaben anzeigen": collapsed every visit (not persisted, CF9-2). */
export function TopTasksToggle({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="pb-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="ml-6 inline-flex min-h-8 items-center gap-1 rounded-lg px-2 font-medium text-foreground-2 text-small hover:bg-hover"
      >
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
        {label}
      </button>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
