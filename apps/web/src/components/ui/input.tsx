// Hand-written in the shadcn/ui shape, styled after the Claude Design prototype (`.inp`).
import type * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex min-h-(--control-h) w-full min-w-0 rounded-lg border border-input bg-card px-3 py-1 text-foreground placeholder:text-faint-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive)]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
