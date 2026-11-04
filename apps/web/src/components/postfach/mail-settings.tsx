"use client";

import { fillVariables } from "@marktwerk/core";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { signatureOf, templatesOf, useMailStore } from "./mail-store";
import { RichEditor } from "./rich-editor";
import { sanitizeMailHtml } from "./sanitize";
import type { MailboxId, MailDemo, MailTemplate, TemplateCategory } from "./types";

const SAMPLE: Record<string, string> = {
  Anrede: "Frau",
  Vorname: "Petra",
  Nachname: "Schmitz",
  Firma: "Trödel Schmitz",
  Veranstaltung: "Flohmarkt Neuss",
  Datum: "So., 11.04.2027",
  Ort: "Neuss – Markt",
  Aufbau: "07:00 Uhr",
  Marktzeit: "11:00–18:00 Uhr",
  PreisProMeter: "15,00 €",
  Stand: "B-12",
  Standlänge: "4 m",
  Postfach: "buchung@coelln-konzept.de",
};

/** Einstellungen → Mail: templates (with variables) and one signature per mailbox. Prototype: browser only. */
export function MailSettings({ demo }: { demo: MailDemo }) {
  const t = useTranslations("postfach.settings");
  const { showToast } = useShell();
  const { state, update } = useMailStore();
  const templates = templatesOf(demo, state);
  const [tab, setTab] = useState<"templates" | "signatures">("templates");
  const [selected, setSelected] = useState<string | null>(templates[0]?.id ?? null);
  const [sigBox, setSigBox] = useState<MailboxId>("buchung");
  const tpl = templates.find((x) => x.id === selected);
  const sample = { ...SAMPLE, MeinName: demo.me.name };

  const save = (next: MailTemplate) =>
    update((s) => ({ ...s, templates: { ...s.templates, [next.id]: next } }));
  const remove = (x: MailTemplate) => {
    const before = state.templates[x.id];
    const had = x.id in state.templates;
    update((s) => ({ ...s, templates: { ...s.templates, [x.id]: null } }));
    setSelected(templates.find((o) => o.id !== x.id)?.id ?? null);
    showToast({
      message: t("deleted", { name: x.name }),
      actionLabel: t("undo"),
      onAction: () =>
        void update((s) => {
          const nextT = { ...s.templates };
          if (had) nextT[x.id] = before ?? null;
          else delete nextT[x.id];
          return { ...s, templates: nextT };
        }),
    });
  };
  const create = (from?: MailTemplate) => {
    const id = `t-${Date.now()}`;
    save({
      id,
      name: from ? t("copyOf", { name: from.name }) : t("newName"),
      mailboxId: from?.mailboxId ?? null,
      category: from?.category ?? "allgemein",
      subject: from?.subject ?? null,
      html: from?.html ?? "<p></p>",
    });
    setSelected(id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={t("tabs")} className="flex gap-1">
        {(["templates", "signatures"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "rounded-md px-3 py-1.5 text-small",
              tab === k ? "bg-selected font-semibold" : "hover:bg-hover",
            )}
          >
            {t(k)}
          </button>
        ))}
      </div>

      {tab === "templates" ? (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <Button onClick={() => create()}>
              <Plus />
              {t("new")}
            </Button>
            <ul className="flex flex-col rounded-xl border bg-card">
              {templates.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(x.id)}
                    className={cn(
                      "flex w-full flex-col border-b px-3 py-2 text-left text-small hover:bg-hover",
                      selected === x.id && "bg-selected",
                    )}
                  >
                    <span className="font-medium">{x.name}</span>
                    <span className="text-muted-foreground text-tiny">
                      {t(`category.${x.category}`)} ·{" "}
                      {x.mailboxId
                        ? demo.mailboxes.find((b) => b.id === x.mailboxId)?.address
                        : t("allMailboxes")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {tpl ? (
            <div key={tpl.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom Input */}
                <label className="flex flex-col gap-1 text-small">
                  <span className="text-muted-foreground">{t("name")}</span>
                  <Input
                    value={tpl.name}
                    onChange={(e) => save({ ...tpl, name: e.target.value })}
                  />
                </label>
                {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom Input */}
                <label className="flex flex-col gap-1 text-small">
                  <span className="text-muted-foreground">{t("subject")}</span>
                  <Input
                    value={tpl.subject ?? ""}
                    placeholder={t("subjectPlaceholder")}
                    onChange={(e) => save({ ...tpl, subject: e.target.value || null })}
                  />
                </label>
                {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom NativeSelect */}
                <label className="flex flex-col gap-1 text-small">
                  <span className="text-muted-foreground">{t("mailbox")}</span>
                  <NativeSelect
                    value={tpl.mailboxId ?? ""}
                    onChange={(e) =>
                      save({ ...tpl, mailboxId: (e.target.value || null) as MailboxId | null })
                    }
                  >
                    <option value="">{t("allMailboxes")}</option>
                    {demo.mailboxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.address}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom NativeSelect */}
                <label className="flex flex-col gap-1 text-small">
                  <span className="text-muted-foreground">{t("categoryLabel")}</span>
                  <NativeSelect
                    value={tpl.category}
                    onChange={(e) => save({ ...tpl, category: e.target.value as TemplateCategory })}
                  >
                    {(["buchung", "genehmigung", "allgemein"] as const).map((c) => (
                      <option key={c} value={c}>
                        {t(`category.${c}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              </div>
              <RichEditor
                initialHtml={tpl.html}
                label={t("body")}
                onChange={(html) => save({ ...tpl, html })}
              />
              <Preview html={tpl.html} values={sample} label={t("preview")} />
              <div className="flex gap-2">
                <Button onClick={() => create(tpl)}>
                  <Copy />
                  {t("duplicate")}
                </Button>
                <Button variant="ghost" onClick={() => remove(tpl)}>
                  <Trash2 />
                  {t("delete")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-small">{t("noTemplate")}</p>
          )}
        </div>
      ) : (
        <div className="flex max-w-3xl flex-col gap-3 rounded-xl border bg-card p-4">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom NativeSelect */}
          <label className="flex max-w-xs flex-col gap-1 text-small">
            <span className="text-muted-foreground">{t("mailbox")}</span>
            <NativeSelect value={sigBox} onChange={(e) => setSigBox(e.target.value as MailboxId)}>
              {demo.mailboxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.address}
                </option>
              ))}
            </NativeSelect>
          </label>
          <p className="text-muted-foreground text-tiny">{t("signatureHint")}</p>
          <RichEditor
            key={sigBox}
            initialHtml={signatureOf(demo, state, sigBox)}
            label={t("signature")}
            minHeight="6rem"
            onChange={(html) =>
              update((s) => ({ ...s, signatures: { ...s.signatures, [sigBox]: html } }))
            }
          />
          <Preview html={signatureOf(demo, state, sigBox)} values={sample} label={t("preview")} />
        </div>
      )}
    </div>
  );
}

function Preview({
  html,
  values,
  label,
}: {
  html: string;
  values: Record<string, string>;
  label: string;
}) {
  return (
    <div>
      <p className="mb-1 font-medium text-muted-foreground text-tiny uppercase tracking-wide">
        {label}
      </p>
      <div
        className="mail-html rounded-lg border bg-sunken p-3 text-small"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by a whitelist
        dangerouslySetInnerHTML={{ __html: sanitizeMailHtml(fillVariables(html, values).html) }}
      />
    </div>
  );
}
