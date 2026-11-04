"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { StandplanData } from "@/components/standplan/types";
import { Composer } from "./composer";
import { useMailStore } from "./mail-store";
import type { Address, MailDemo } from "./types";

/** `/postfach/neu`: a new mail, or a saved draft of one (`?entwurf=`). */
export function NewMailView({
  demo,
  plan,
  to,
  eventId,
  draftId,
}: {
  demo: MailDemo;
  plan: StandplanData;
  to: Address[];
  eventId: string | null;
  draftId: string | null;
}) {
  const router = useRouter();
  const { state } = useMailStore();
  const resume = draftId ? state.drafts.find((d) => d.id === draftId) : undefined;
  return (
    <div className="max-w-4xl">
      <Composer
        key={resume?.id ?? "new"}
        demo={demo}
        plan={plan}
        conversation={null}
        messages={[]}
        mode="new"
        resume={resume}
        defaultTo={to}
        defaultEventId={eventId}
        onClose={() => router.push("/postfach" as Route)}
        onSent={(id) => router.push(`/postfach?ordner=wartet&konv=${id}` as Route)}
      />
    </div>
  );
}
