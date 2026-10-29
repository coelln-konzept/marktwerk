// Hand-written stand-in for the shadcn/ui label. Replace with `shadcn add label --overwrite`.
import { useTranslations } from "next-intl";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Form label. Fields are required by default; `optional` adds a quiet "(optional)" after the text
 * (decision 2026-10-29, GOV.UK convention: no asterisks).
 */
function Label({
  className,
  optional,
  children,
  ...props
}: React.ComponentProps<"label"> & { optional?: boolean }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: consumers pass htmlFor
    <label
      data-slot="label"
      className={cn(
        "flex select-none items-center gap-2 font-medium text-small leading-none",
        className,
      )}
      {...props}
    >
      {children}
      {optional ? <OptionalMark /> : null}
    </label>
  );
}

/** "(optional)" for labels that are not built with `Label`. */
function OptionalMark() {
  const t = useTranslations("form");
  return <span className="font-normal text-muted-foreground">{t("optional")}</span>;
}

export { Label, OptionalMark };
