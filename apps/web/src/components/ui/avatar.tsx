import { cn } from "@/lib/utils";

// Muted pastel backgrounds from the design, picked deterministically per person.
const COLOURS = ["#E2D3F1", "#CDE4E6", "#EADFCB", "#D5E6CD", "#F4D2C3", "#F4D7E2", "#D4DAF0"];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

export function Avatar({
  name,
  size = "sm",
  className,
}: {
  name: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return (
    <span
      title={name}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-bold text-[#2A2824] shadow-[0_0_0_2px_var(--card)]",
        size === "sm" ? "size-6 text-[10.5px]" : "size-8 text-xs",
        className,
      )}
      style={{ background: COLOURS[Math.abs(hash) % COLOURS.length] }}
    >
      <span aria-hidden>{initials(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
