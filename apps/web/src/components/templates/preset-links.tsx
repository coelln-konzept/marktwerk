"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setPresetsAction } from "@/app/(app)/vorlagen/ablauf/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";

export type PresetChoice = {
  id: string;
  name: string;
  typeKey: string;
  typeName: string;
  active: boolean;
};

/**
 * "Gilt für Vorlagen: …": which event presets create this timeline for their new events. The link is the
 * only thing that changes here; existing events keep what they have (changes reach them only through
 * "Auf Veranstaltungen anwenden…").
 */
export function PresetLinks({
  templateId,
  presets,
  linkedIds,
  canWrite,
}: {
  templateId: string;
  presets: PresetChoice[];
  linkedIds: string[];
  canWrite: boolean;
}) {
  const t = useTranslations("taskTemplates.links");
  const tErr = useTranslations("taskTemplates");
  const { showToast } = useShell();
  const [selected, setSelected] = useState(() => new Set(linkedIds));
  const [pending, startTransition] = useTransition();
  const dirty = selected.size !== linkedIds.length || linkedIds.some((id) => !selected.has(id));

  function save() {
    startTransition(async () => {
      const result = await setPresetsAction(templateId, [...selected]);
      showToast({
        message: result.ok
          ? t("saved")
          : tErr.has(`errors.${result.error}` as never)
            ? tErr(`errors.${result.error}` as never)
            : tErr("errors.generic"),
      });
    });
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>{t("title")}</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-3">
        <p className="text-muted-foreground text-small">{t("hint")}</p>
        {presets.length === 0 ? (
          <p className="text-muted-foreground text-small">{t("none")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {presets.map((p) => (
              <li key={p.id}>
                <label className="flex min-h-8 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-(--primary)"
                    checked={selected.has(p.id)}
                    disabled={!canWrite || pending}
                    onChange={(e) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        return next;
                      })
                    }
                  />
                  <span className={p.active ? "" : "text-muted-foreground"}>{p.name}</span>
                  <EventTypeTag typeKey={p.typeKey}>{p.typeName}</EventTypeTag>
                  {!p.active && (
                    <span className="text-muted-foreground text-tiny">{t("inactive")}</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <div>
            <Button
              variant="default"
              disabled={!dirty || pending}
              aria-busy={pending}
              onClick={save}
            >
              {t("save")}
            </Button>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
