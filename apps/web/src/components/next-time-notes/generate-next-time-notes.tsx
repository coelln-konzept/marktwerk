"use client";

import { Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { loadOpenNextTimeNotes } from "@/app/(app)/next-time-notes-actions";
import { callAction } from "@/lib/call-action";
import type { NextTimeNoteRow } from "@/server/queries/next-time-notes";
import { NextTimeNoteList } from "./next-time-note-list";

type State =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; notes: NextTimeNoteRow[] };

/**
 * "Markt planen", last step (Fahrplan R25): the market's open "Fürs nächste Mal" notes above the dates, with the
 * tick to mark what is done (undo toast). Nothing at all when the market has no open note.
 */
export function GenerateNextTimeNotes({ presetId }: { presetId: string }) {
  const t = useTranslations("nextTimeNotes");
  const [state, setState] = useState<State>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // `attempt` re-runs the load ("Noch einmal").
    void attempt;
    let cancelled = false;
    setState({ state: "loading" });
    callAction(() => loadOpenNextTimeNotes(presetId)).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { state: "ready", notes: result.data } : { state: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [presetId, attempt]);

  if (state.state === "loading")
    return (
      <p role="status" className="m-0 text-muted-foreground text-small">
        {t("generate.loading")}
      </p>
    );
  if (state.state === "error")
    return (
      <p role="alert" className="m-0 flex flex-wrap items-center gap-2 text-small text-status-warn">
        {t("generate.failed")}
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="inline-flex min-h-7 cursor-pointer items-center rounded-full border border-input bg-card px-3 font-medium text-small hover:bg-hover touch:min-h-10"
        >
          {t("generate.retry")}
        </button>
      </p>
    );
  if (state.notes.length === 0) return null;
  return (
    <section
      aria-labelledby="generate-next-time"
      className="overflow-hidden rounded-lg border border-status-warn-dot/40 bg-card"
    >
      <div className="flex flex-col gap-0.5 border-border-subtle border-b px-3 py-2">
        <h3
          id="generate-next-time"
          className="m-0 inline-flex items-center gap-2 font-semibold text-[15px]"
        >
          <Lightbulb aria-hidden className="size-4 text-status-warn" />
          {t("generate.title")}
          <span className="tabular font-normal text-muted-foreground text-small">
            {t("openCount", { count: state.notes.length })}
          </span>
        </h3>
        <p className="m-0 text-foreground-2 text-small">{t("generate.intro")}</p>
      </div>
      <NextTimeNoteList open={state.notes} canWrite emptyText={null} />
    </section>
  );
}
