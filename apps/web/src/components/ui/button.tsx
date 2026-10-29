// Hand-written in the shadcn/ui shape, styled after the Claude Design prototype (`.btn`).
// Default variant is the outlined button; `variant="default"` is the teal primary.
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-45 aria-busy:cursor-progress aria-busy:opacity-80 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:bg-primary-hover",
        outline: "border-input bg-card text-foreground hover:bg-hover",
        ghost: "border-transparent bg-transparent hover:bg-hover",
        destructive: "border-destructive bg-destructive text-on-critical hover:opacity-90",
        link: "border-transparent text-accent-soft-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-8 px-3 py-1 in-data-[density=compact]:min-h-7",
        sm: "min-h-7 gap-1 rounded-md px-2 py-0.5 text-tiny in-data-[density=compact]:min-h-6",
        lg: "min-h-[52px] rounded-xl px-5 text-base font-semibold",
        icon: "size-8",
        "icon-sm": "size-7 rounded-md",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      type="button"
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
