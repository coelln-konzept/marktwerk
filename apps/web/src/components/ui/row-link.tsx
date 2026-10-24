"use client";

import { useRouter } from "next/navigation";
import type * as React from "react";
import { openOnRowClick } from "./keyboard-rows";
import { TR } from "./table";

/**
 * A table row that opens `href` when clicked anywhere. Keyboard and screen-reader users use the real link
 * inside the row (the click handler ignores clicks that land on a link or button themselves).
 */
export function LinkRow({
  href,
  className,
  onClick,
  ...props
}: React.ComponentProps<"tr"> & { href: string }) {
  const router = useRouter();
  return (
    <TR
      onClick={(event) => {
        onClick?.(event);
        openOnRowClick(event, href, (to) => router.push(to as never));
      }}
      className={`cursor-pointer ${className ?? ""}`}
      {...props}
    />
  );
}
