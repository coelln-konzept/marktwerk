"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * "+ Neu" in the top bar links to a page with `?neu=1`; the page's create dialog calls this hook to open
 * itself once and drop the parameter again (so reload and back do not reopen it).
 */
export function useOpenOnNew(open: () => void, enabled = true) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requested = params.get("neu") === "1";
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the request itself should re-run this
  useEffect(() => {
    if (!requested || !enabled) return;
    open();
    const rest = new URLSearchParams(params);
    rest.delete("neu");
    const query = rest.toString();
    router.replace((query ? `${pathname}?${query}` : pathname) as never, { scroll: false });
  }, [requested, enabled]);
}
