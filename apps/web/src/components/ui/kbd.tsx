import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "whitespace-nowrap rounded-sm border border-input border-b-2 bg-surface-2 px-1 font-mono text-[11px] text-foreground-2 leading-4",
        className,
      )}
      {...props}
    />
  );
}
