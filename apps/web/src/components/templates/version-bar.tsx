"use client";

import { CopyPlus, FilePen, GitBranch, Rocket, Trash2, Undo2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  createDraftAction,
  discardDraftAction,
  publishDraftAction,
} from "@/app/(app)/vorlagen/ablauf/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type VersionChip = {
  id: string;
  version: number;
  status: "draft" | "published" | "retired";
  /** YYYY-MM-DD in the company time zone */
  publishedOn: string | null;
  itemCount: number;
};

/**
 * Version chips, plus the actions that belong to the selected version: publish / discard the draft,
 * start a new draft from the published version, apply the published version to events.
 * Publishing never touches existing events (data model principle 5); the toast offers the deliberate next step.
 */
export function VersionBar({
  templateId,
  versions,
  selected,
  canWrite,
}: {
  templateId: string;
  versions: VersionChip[];
  selected: VersionChip;
  canWrite: boolean;
}) {
  const t = useTranslations("taskTemplates");
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const { confirm, dialog } = useConfirm();
  const [publishing, setPublishing] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const base = `/vorlagen/ablauf/${templateId}`;
  const hasDraft = versions.some((v) => v.status === "draft");
  const published = versions.find((v) => v.status === "published");
  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  function createDraft() {
    startTransition(async () => {
      const result = await createDraftAction(templateId);
      if (!result.ok) {
        showToast({ message: errorText(result.error) });
        return;
      }
      router.push(`${base}?v=${result.data.version}` as never);
      showToast({ message: t("versions.draftCreated", { version: result.data.version }) });
    });
  }

  async function discard() {
    const ok = await confirm({
      title: t("versions.discardTitle", { version: selected.version }),
      description: t("versions.discardDescription"),
      confirmLabel: t("versions.discardConfirm"),
      cancelLabel: t("versions.cancel"),
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await discardDraftAction(selected.id);
      if (!result.ok) {
        showToast({ message: errorText(result.error) });
        return;
      }
      router.push(base as never);
      showToast({ message: t("versions.discarded", { version: selected.version }) });
    });
  }

  function publish() {
    setError(null);
    startTransition(async () => {
      const result = await publishDraftAction(selected.id, note.trim() === "" ? null : note);
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      setPublishing(false);
      setNote("");
      router.push(`${base}?v=${result.data.version}` as never);
      showToast({
        message: t("versions.published", { version: result.data.version }),
        actionLabel: t("versions.applyAction"),
        onAction: () => router.push(`${base}?v=${result.data.version}&anwenden=1` as never),
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("versions.label")} className="flex flex-wrap items-center gap-2">
          {versions.map((v) => (
            <Link
              key={v.id}
              href={`${base}?v=${v.version}` as never}
              scroll={false}
              aria-current={v.id === selected.id ? "true" : undefined}
              title={v.publishedOn ? formatDate(v.publishedOn, locale) : undefined}
              className={cn(
                "inline-flex min-h-8 items-center gap-2 rounded-full border border-input bg-card px-3 font-medium text-small hover:bg-hover",
                "aria-[current=true]:border-foreground aria-[current=true]:bg-foreground aria-[current=true]:text-background",
              )}
            >
              <span className="tabular">{t("versions.chip", { version: v.version })}</span>
              <span className="font-normal opacity-80">{t(`versions.status.${v.status}`)}</span>
            </Link>
          ))}
        </nav>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            {selected.status === "draft" && (
              <>
                <Button disabled={pending} onClick={discard}>
                  <Trash2 aria-hidden />
                  {t("versions.discard")}
                </Button>
                <Button
                  variant="default"
                  disabled={pending || selected.itemCount === 0}
                  onClick={() => {
                    setError(null);
                    setPublishing(true);
                  }}
                >
                  <Rocket aria-hidden />
                  {t("versions.publish")}
                </Button>
              </>
            )}
            {!hasDraft && published && (
              <Button disabled={pending} aria-busy={pending} onClick={createDraft}>
                <CopyPlus aria-hidden />
                {t("versions.newDraft", { version: published.version })}
              </Button>
            )}
            {selected.status === "published" && (
              <Link
                href={`${base}?v=${selected.version}&anwenden=1` as never}
                scroll={false}
                className={buttonVariants({ variant: "outline" })}
              >
                <Users aria-hidden />
                {t("apply.open")}
              </Link>
            )}
          </div>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-muted-foreground text-small">
        {selected.status === "draft" ? (
          <StatusBadge tone="info" icon={FilePen} outline>
            {t("versions.draftBadge", { version: selected.version })}
          </StatusBadge>
        ) : selected.status === "published" ? (
          <StatusBadge tone="ok" icon={GitBranch}>
            {t("versions.publishedBadge", { version: selected.version })}
          </StatusBadge>
        ) : (
          <StatusBadge tone="neutral" icon={Undo2} outline>
            {t("versions.retiredBadge", { version: selected.version })}
          </StatusBadge>
        )}
        {t(`versions.hint.${selected.status}`)}
      </p>

      <Modal
        open={publishing}
        onOpenChange={(next) => !pending && setPublishing(next)}
        title={t("versions.publishTitle", { version: selected.version })}
        description={t("versions.publishDescription")}
        closeLabel={t("versions.cancel")}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            publish();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="publish-note">{t("versions.note")}</Label>
            <textarea
              id="publish-note"
              rows={3}
              maxLength={500}
              className={TEXTAREA_CLASS}
              value={note}
              placeholder={t("versions.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {published && (
            <p className="text-muted-foreground text-small">
              {t("versions.retires", { version: published.version })}
            </p>
          )}
          {error && (
            <p role="alert" className="text-small text-status-critical">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setPublishing(false)}>
              {t("versions.cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {t("versions.publishConfirm")}
            </Button>
          </div>
        </form>
      </Modal>
      {dialog}
    </div>
  );
}
