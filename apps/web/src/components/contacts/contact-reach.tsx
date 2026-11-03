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
