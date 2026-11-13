"use client";

import {
  type MarketRules,
  parseBannedGoods,
  parseSharePercent,
  shareToPercentInput,
} from "@marktwerk/core";
import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveMarketRules, undoMarketRules } from "@/app/(app)/veranstaltungen/[id]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { TEXTAREA_CLASS } from "./textarea-class";

/**
 * "Bearbeiten" in the Marktregeln panel (UT2-12, decision D2-3): new-goods share, banned goods and online
 * booking of the event's market. They apply to every date of that market; saving shows an undo toast.
 * The other rule fields (price defaults, contract model) are kept as they are.
 */
export function RulesDialog({
  presetId,
  presetName,
  rules,
}: {
  presetId: string;
  presetName: string;
  rules: MarketRules;
}) {
  const t = useTranslations("eventDetail.rules");
  const locale = useLocale();
  const { showToast } = useShell();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [share, setShare] = useState("");
  const [banned, setBanned] = useState("");
  const [online, setOnline] = useState(rules.onlineBookingAllowed);
  const [error, setError] = useState<{ field: string; text: string } | null>(null);

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  const fieldOf = (code: string) =>
    code === "invalid_share" ? "share" : code === "invalid_banned_goods" ? "banned" : "form";

  function openDialog() {
    setShare(shareToPercentInput(rules.newGoodsMaxShare, locale !== "en"));
    setBanned(rules.bannedGoods.join("\n"));
    setOnline(rules.onlineBookingAllowed);
    setError(null);
    setOpen(true);
  }

  function submit() {
    const newGoodsMaxShare = parseSharePercent(share);
    if (newGoodsMaxShare === null)
      return setError({ field: "share", text: errorText("invalid_share") });
    const next: MarketRules = {
      ...rules,
      newGoodsMaxShare,
      bannedGoods: parseBannedGoods(banned),
      onlineBookingAllowed: online,
    };
    setError(null);
    startTransition(async () => {
      const result = await saveMarketRules(presetId, next);
      if (!result.ok) {
        setError({ field: fieldOf(result.error), text: errorText(result.error) });
        return;
      }
      setOpen(false);
      if (!result.data.changed) {
        showToast({ message: t("unchanged") });
        return;
      }
      const { previous, rules: saved } = result.data;
      showToast({
        message: t("saved"),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoMarketRules(presetId, previous, saved);
          showToast({ message: undone.ok ? t("reverted") : errorText(undone.error) });
        },
      });
    });
  }

  const invalid = (field: string) =>
    error?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": "rules-error" }
      : {};

  return (
    <>
      <Button size="sm" variant="ghost" aria-label={t("title")} onClick={openDialog}>
        <Pencil aria-hidden />
        {t("edit")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("title")}
        description={t("description", { market: presetName })}
        closeLabel={t("cancel")}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rules-share">{t("share")}</Label>
            <div className="relative w-32">
              <Input
                id="rules-share"
                inputMode="decimal"
                autoComplete="off"
                value={share}
                onChange={(e) => setShare(e.target.value)}
                className="tabular pr-8"
                {...invalid("share")}
              />
              <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                %
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rules-banned">{t("banned")}</Label>
            <textarea
              id="rules-banned"
              rows={5}
              value={banned}
              onChange={(e) => setBanned(e.target.value)}
              aria-describedby="rules-banned-hint"
              className={cn(TEXTAREA_CLASS, "resize-y")}
              {...invalid("banned")}
            />
            <p id="rules-banned-hint" className="text-muted-foreground text-tiny">
              {t("bannedHint")}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <input
              id="rules-online"
              type="checkbox"
              checked={online}
              onChange={(e) => setOnline(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <Label htmlFor="rules-online">{t("online")}</Label>
          </div>
          {error && (
            <p id="rules-error" role="alert" className="text-small text-status-critical">
              {error.text}
            </p>
          )}
          <p className="text-faint-foreground text-small">{t("scopeHint")}</p>
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
