import { cn } from "@/lib/utils";

/** Neutral tag for a duty role / category (not a status, so no colour coding). */
export function Tag({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-md bg-status-neutral-bg px-2 font-medium text-foreground-2 text-tiny",
        className,
      )}
      {...props}
    />
  );
}

export function TagList({
  items,
  empty,
  className,
}: {
  items: string[];
  empty?: React.ReactNode;
  className?: string;
}) {
  if (items.length === 0)
    return empty ? <span className="text-faint-foreground">{empty}</span> : null;
  return (
    <ul className={cn("m-0 flex list-none flex-wrap gap-1 p-0", className)}>
      {items.map((item) => (
        <li key={item}>
          <Tag>{item}</Tag>
        </li>
      ))}
    </ul>
  );
}
