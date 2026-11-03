"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Keyboard, LogOut, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setDisplayPreference, setLocale } from "@/app/(app)/actions";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import { LOCALES } from "@/i18n/config";
import { authClient } from "@/lib/auth-client";
import { DEV_AUTO_LOGIN_OPT_OUT } from "@/server/dev-auto-login";
import { SHORTCUTS_EVENT } from "./shortcuts-dialog";

const item =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[highlighted]:bg-hover";
const label =
  "px-2 pt-2 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider";

/** Profile menu at the bottom of the sidebar: Einstellungen, language, theme (System/Hell/Dunkel), density, sign out. */
export function ProfileMenu({
  name,
  role,
  theme,
  density,
  showSettings,
}: {
  name: string;
  role: string;
  theme: string;
  density: string;
  /** Einstellungen lives here (not in the sidebar); only for people who may read the settings. */
  showSettings?: boolean;
}) {
  const t = useTranslations("profile");
  const tLang = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const themeLabel = (value: string) => t(`theme.${value as "system" | "light" | "dark"}`);

  return (
    <Menu.Root>
      <Menu.Trigger className="flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 text-left hover:bg-hover">
        {/* The avatar repeats the name; hidden so the button is not read as "Name Name Rolle". */}
        <span aria-hidden className="inline-flex">
          <Avatar name={name} size="lg" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{name}</span>
          <span className="block truncate text-muted-foreground text-tiny">{role}</span>
        </span>
        <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={6} className="z-50">
          <Menu.Popup className="flex min-w-[220px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden">
            {showSettings && (
              <>
                <Menu.LinkItem render={<Link href={"/einstellungen" as never} />} className={item}>
                  <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" />
                  {t("settings")}
                </Menu.LinkItem>
                <Menu.Separator className="my-1 border-border-subtle border-t" />
              </>
            )}
            <Menu.Group>
              <Menu.GroupLabel className={label}>{t("design")}</Menu.GroupLabel>
              <Menu.RadioGroup
                defaultValue={theme}
                onValueChange={(value) => {
                  document.documentElement.dataset.theme = String(value);
                  startTransition(() => setDisplayPreference({ theme: String(value) }));
                }}
              >
                {(["system", "light", "dark"] as const).map((value) => (
                  <Menu.RadioItem key={value} value={value} closeOnClick={false} className={item}>
                    <span className="w-4">
                      <Menu.RadioItemIndicator>
                        <Check className="size-4" />
                      </Menu.RadioItemIndicator>
                    </span>
                    {themeLabel(value)}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            <Menu.Separator className="my-1 border-border-subtle border-t" />
            <Menu.Group>
              <Menu.GroupLabel className={label}>{t("density")}</Menu.GroupLabel>
              <Menu.RadioGroup
                defaultValue={density}
                onValueChange={(value) => {
                  document.documentElement.dataset.density = String(value);
                  startTransition(() => setDisplayPreference({ density: String(value) }));
                }}
              >
                {(["standard", "compact"] as const).map((value) => (
                  <Menu.RadioItem key={value} value={value} closeOnClick={false} className={item}>
                    <span className="w-4">
                      <Menu.RadioItemIndicator>
                        <Check className="size-4" />
                      </Menu.RadioItemIndicator>
                    </span>
                    {t(`densities.${value}`)}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            <Menu.Separator className="my-1 border-border-subtle border-t" />
            <Menu.Group>
              <Menu.GroupLabel className={label}>{tLang("label")}</Menu.GroupLabel>
              <Menu.RadioGroup
                value={locale}
                onValueChange={(value) => startTransition(() => setLocale(String(value)))}
              >
                {LOCALES.map((value) => (
                  <Menu.RadioItem key={value} value={value} className={item}>
                    <span className="w-4">
                      <Menu.RadioItemIndicator>
                        <Check className="size-4" />
                      </Menu.RadioItemIndicator>
                    </span>
                    {tLang(value)}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            <Menu.Separator className="my-1 border-border-subtle border-t" />
            <Menu.Item
              className={item}
              onClick={() => window.dispatchEvent(new Event(SHORTCUTS_EVENT))}
            >
              <Keyboard aria-hidden className="size-4 text-muted-foreground" />
              {t("shortcuts")}
              <Kbd className="ml-auto touch:hidden">?</Kbd>
            </Menu.Item>
            <Menu.Item
              className={item}
              onClick={async () => {
                // Local development: don't sign straight back in (see server/dev-auto-login.ts).
                if (process.env.NODE_ENV === "development")
                  await globalThis.cookieStore?.set({
                    name: DEV_AUTO_LOGIN_OPT_OUT,
                    value: "1",
                    path: "/",
                  });
                await authClient.signOut();
                router.replace("/login");
                router.refresh();
              }}
            >
              <LogOut className="size-4" />
              {t("signOut")}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
