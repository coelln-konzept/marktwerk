"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createMasterAction } from "@/app/(app)/vorlagen/ablauf/actions";
import { Button } from "@/components/ui/button";

/** "Grundvorlage anlegen": for a database without a master template; opens its editor. */
export function CreateMasterButton() {
  const t = useTranslations("library.master");
  const tErrors = useTranslations("taskTemplates.errors");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createMasterAction();
      if (!result.ok) {
        setError(
          tErrors.has(result.error as never) ? tErrors(result.error as never) : tErrors("generic"),
        );
        return;
      }
      router.push(`/vorlagen/ablauf/${result.data.id}` as never);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="default" onClick={create} disabled={pending} aria-busy={pending}>
        <Plus aria-hidden />
        {t("create")}
      </Button>
      {error && (
        <p role="alert" className="text-small text-status-critical">
          {error}
        </p>
      )}
    </div>
  );
}
