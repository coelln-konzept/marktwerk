"use client";

import type { VenueKindKey } from "@marktwerk/core";
import { ListChecks } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VenueNeedsDialog, type VenueNeedsReason } from "./venue-needs-dialog";

/** `?bedarf=neu` after "Ort anlegen", `?bedarf=art` after a switch Städtisch ↔ Privat, `?bedarf=1` by link. */
const REASON_OF: Record<string, VenueNeedsReason> = {
  neu: "created",
  art: "kindChanged",
  "1": "manual",
};

/**
 * "Was braucht dieser Ort?" on the Ort page (Fahrplan R30): a button in "Genehmigungen und Zustimmungen", and the
 * dialog opening by itself when the page is reached with `?bedarf=` (the Ort form sends it after creating an Ort or
 * switching its kind). The parameter is dropped once the dialog is open, so reload and back do not reopen it.
 */
export function VenueNeedsButton({
  venueId,
  venueName,
  kind,
  current,
}: {
  venueId: string;
  venueName: string;
  kind: VenueKindKey;
  current: readonly string[];
}) {
  const t = useTranslations("venueNeeds");
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requested = params.get("bedarf");
  const [reason, setReason] = useState<VenueNeedsReason | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only the request itself should re-run this
  useEffect(() => {
    if (!requested) return;
    setReason(REASON_OF[requested] ?? "manual");
    const rest = new URLSearchParams(params);
    rest.delete("bedarf");
    const query = rest.toString();
    router.replace((query ? `${pathname}?${query}` : pathname) as never, { scroll: false });
  }, [requested]);

  return (
    <>
      <Button onClick={() => setReason("manual")}>
        <ListChecks aria-hidden />
        {t("open")}
      </Button>
      <VenueNeedsDialog
        open={reason !== null}
        onOpenChange={(open) => !open && setReason(null)}
        venueId={venueId}
        venueName={venueName}
        kind={kind}
        current={current}
        reason={reason ?? "manual"}
      />
    </>
  );
}
