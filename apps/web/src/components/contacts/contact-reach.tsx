import { formatPhone } from "@marktwerk/core";
import { Mail, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Anrufen" (tel:) and "E-Mail" (mailto:) as real buttons, 44 px high: contacts are looked up to reach
 * somebody, often from a phone on site. Renders nothing for a contact with neither number nor address.
 * `primary` makes the call button the teal main action (Vorschau); in lists both stay quiet.
 */
export function ContactReach({
  name,
  phone,
  email,
  primary = false,
  className,
}: {
  name: string;
  phone: string | null;
  email: string | null;
  primary?: boolean;
  className?: string;
}) {
  const t = useTranslations("contacts");
  if (!phone && !email) return null;
  const button = "min-h-11 flex-1 sm:min-h-8 sm:flex-none";
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {phone && (
        <a
          href={`tel:${phone.replace(/\s+/g, "")}`}
          aria-label={t("call", { name })}
          className={cn(buttonVariants({ variant: primary ? "default" : "outline" }), button)}
        >
          <Phone aria-hidden />
          {t("callShort")}
        </a>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          aria-label={t("mail", { name })}
          className={cn(buttonVariants({ variant: "outline" }), button)}
        >
          <Mail aria-hidden />
          {t("mailShort")}
        </a>
      )}
    </div>
  );
}

/**
 * A phone number or e-mail address inside a clickable list row (UT-18): the value itself is plain text, so a
 * click on it opens the row like anywhere else; only the icon button next to it calls or writes.
 */
export function ReachValue({
  kind,
  value,
  name,
}: {
  kind: "phone" | "email";
  value: string;
  name: string;
}) {
  const t = useTranslations("contacts");
  const phone = kind === "phone";
  const Icon = phone ? Phone : Mail;
  const label = t(phone ? "call" : "mail", { name });
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <a
        href={phone ? `tel:${value.replace(/\s+/g, "")}` : `mailto:${value}`}
        aria-label={label}
        title={label}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground"
      >
        <Icon aria-hidden className="size-4" />
      </a>
      <span className={phone ? "tabular whitespace-nowrap" : "min-w-0 break-all"}>
        {phone ? formatPhone(value) : value}
      </span>
    </span>
  );
}
