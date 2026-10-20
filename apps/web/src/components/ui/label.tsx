// Hand-written stand-in for the shadcn/ui label. Replace with `shadcn add label --overwrite`.
import type * as React from "react";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: consumers pass htmlFor
    <label
      data-slot="label"
      className={cn("flex select-none items-center gap-2 text-sm font-medium leading-none", className)}
      {...props}
    />
  );
}

export { Label };
