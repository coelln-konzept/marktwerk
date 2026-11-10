import { type InitialLetter, LETTERS } from "@marktwerk/core/text/letter";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const ITEM =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 font-medium text-small";

/**
 * The A–Z selector above a list (CF9-7): "Alle · A B C … Z · #". Every letter is a link (the filter lives
 * in the URL, the caller's `hrefFor` drops the page); a letter with no entries under the other filters is
 * shown disabled, not as a link; the active one carries `aria-current`. Plain links, so they sit in the
 * tab order and work without JS.
 */
export function LetterFilter({
  active,
  available,
  hrefFor,
  className,
}: {
  active?: InitialLetter;
  /** Letters with entries under the other active filters. */
  available: readonly InitialLetter[];
  /** The list's URL for a letter, `undefined` = "Alle"; resets paging and any open Vorschau. */
  hrefFor: (letter: InitialLetter | undefined) => string;
  className?: string;
}) {
  const t = useTranslations("letterFilter");
  const has = new Set<string>(available);
  return (
    <nav aria-label={t("label")} className={cn("flex flex-wrap items-center gap-0.5", className)}>
      <Link
        href={hrefFor(undefined) as never}
        scroll={false}
        aria-current={active ? undefined : "true"}
        className={cn(
          ITEM,
          "px-3 hover:bg-hover aria-[current=true]:bg-foreground aria-[current=true]:text-background",
        )}
      >
        {t("all")}
      </Link>
      <span aria-hidden className="mx-1 h-4 w-px bg-border" />
      {[...LETTERS, "#" as const].map((letter) => {
        const label = letter === "#" ? t("other") : undefined;
        if (!has.has(letter) && active !== letter)
          return (
            <span
              key={letter}
              aria-disabled="true"
              title={t("none")}
              className={cn(ITEM, "text-faint-foreground")}
            >
              {letter}
            </span>
          );
        return (
          <Link
            key={letter}
            href={hrefFor(letter) as never}
            scroll={false}
            aria-current={active === letter ? "true" : undefined}
            aria-label={label}
            title={label}
            className={cn(
              ITEM,
              "hover:bg-hover aria-[current=true]:bg-foreground aria-[current=true]:text-background",
            )}
          >
            {letter}
          </Link>
        );
      })}
    </nav>
  );
}
