"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

const KEY = "marktwerk:pages";
const MAX = 50;

/** One visited page: its path and the last URL it had (filters, open tab), per browser tab. */
type Visit = { path: string; url: string };

function read(): Visit[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Visit[]) : [];
  } catch {
    return [];
  }
}

function write(stack: Visit[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-MAX)));
  } catch {
    // private mode or storage blocked: the button falls back to the parent page
  }
}

/**
 * Remembers the pages visited in this tab. Only path changes count as a new page; drawers, Vorschau and
 * filters (search params) just update the current page's URL, so "back" never reopens a closed drawer.
 */
export function useVisitedPages() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    const url = search ? `${pathname}?${search}` : pathname;
    const stack = read();
    const top = stack.at(-1);
    if (top?.path === pathname) top.url = url;
    else if (stack.at(-2)?.path === pathname) {
      stack.pop();
      const back = stack.at(-1);
      if (back) back.url = url;
    } else stack.push({ path: pathname, url });
    write(stack);
  }, [pathname, search]);
}

/**
 * "←" before the breadcrumb on pages below the sidebar level: back to the page you came from in this
 * tab (with its filters), or to the parent page when this one was opened directly.
 */
export function BackButton({ parentHref }: { parentHref: string }) {
  const t = useTranslations("topbar");
  const router = useRouter();
  const pathname = usePathname();
  return (
    <button
      type="button"
      aria-label={t("back")}
      title={t("back")}
      onClick={() => {
        const stack = read();
        const previous = stack.at(-1)?.path === pathname ? stack.at(-2) : stack.at(-1);
        router.push((previous?.url ?? parentHref) as never);
      }}
      className="-ml-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ArrowLeft aria-hidden className="size-4" />
    </button>
  );
}
