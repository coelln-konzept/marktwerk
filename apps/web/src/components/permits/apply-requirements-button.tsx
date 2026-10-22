"use client";

import { Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { applyRequirementsAction } from "@/app/(app)/orte/[id]/genehmigungen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";

/** Runs the logbook fill for the venue's upcoming events (idempotent) and reports what it created. */
export function ApplyRequirementsButton({ venueId }: { venueId: string }) {
  const t = useTranslations("requirements");
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();

  function apply() {
    startTransition(async () => {
      const result = await applyRequirementsAction(venueId);
      if (!result.ok) return showToast({ message: t("errors.generic") });
      showToast({ message: t("applied", result.data) });
    });
  }

  return (
    <Button disabled={pending} aria-busy={pending} onClick={apply} title={t("applyUpcomingHint")}>
      <Wand2 aria-hidden />
      {t("applyUpcoming")}
    </Button>
  );
}
