import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * tailwind-merge must know the theme's own font sizes (globals.css `--text-body/small/tiny`): otherwise
 * it reads `text-tiny` as a text colour and drops it, or drops the colour next to it (status badges
 * rendered at 14 px, small primary buttons lost their white text).
 */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["body", "small", "tiny"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
