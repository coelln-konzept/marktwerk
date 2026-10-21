import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const TAB =
  "-mb-px inline-flex min-h-9 items-center border-b-2 px-3 font-medium hover:text-foreground";

/** The two tabs of /vorlagen: Veranstaltungs-Vorlagen (presets) and Ablaufvorlagen (timelines). */
export function TemplateTabs({ current }: { current: "events" | "timelines" }) {
  const t = useTranslations("templates");
  const tab = (key: "events" | "timelines", href: string) => (
    <Link
      href={href as never}
      aria-current={current === key ? "page" : undefined}
      className={cn(
        TAB,
        current === key
          ? "border-primary font-semibold text-foreground"
          : "border-transparent text-muted-foreground",
      )}
    >
      {t(`tabs.${key}`)}
    </Link>
  );
  return (
    <nav aria-label={t("tabsLabel")} className="-mb-2 flex gap-1 border-b">
      {tab("events", "/vorlagen")}
      {tab("timelines", "/vorlagen/ablauf")}
    </nav>
  );
}
