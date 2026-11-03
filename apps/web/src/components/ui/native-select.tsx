// A native <select> (keeps the OS picker and keyboard behaviour) with the app's own chevron.
import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** Classes of the select element itself: same height, border and radius as `Input`. */
export const nativeSelectClass =
  "min-h-(--control-h) w-full min-w-0 appearance-none rounded-lg border border-input bg-card py-1 pr-9 pl-3 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive";

/**
 * `appearance-none` select with a lucide chevron (the browser chevron differs per OS and ignores the
 * theme). `className` goes on the select; `wrapperClassName` on the box that positions the chevron.
 */
export function NativeSelect({
  className,
  wrapperClassName,
  children,
  ...props
}: React.ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative inline-block min-w-0 max-w-full", wrapperClassName)}>
      <select data-slot="select" className={cn(nativeSelectClass, className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
