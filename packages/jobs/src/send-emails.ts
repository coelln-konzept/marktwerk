import { type Database, outboundMessage } from "@marktwerk/db";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { createMailTransport, type MailTransport } from "./mail/transport";
import { emailSettings } from "./shared";

/** A message is tried this many times, then marked `failed`. */
export const MAX_SEND_ATTEMPTS = 5;
const BATCH = 50;
/** Wait before the next try: attempts x 10 minutes. */
const BACKOFF_MS = 10 * 60 * 1000;
/**
 * How long a claimed message stays out of other runs. One send is a handful of SMTP round trips with a 20 s
 * timeout each, so a run that still holds a claim after this long has crashed; its message is sendable again.
 */
export const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

export type SendResult = { sent: number; failed: number; retrying: number };

type Message = typeof outboundMessage.$inferSelect;

/**
 * Claims the next due email for this run, or returns null. In one short transaction the row is locked with
 * `FOR UPDATE SKIP LOCKED` (an overlapping run skips it instead of waiting), `attempts` goes up and `send_after`
 * moves `CLAIM_TIMEOUT_MS` ahead. That later `send_after` is the claim marker: no other run selects the message
 * while it is being sent, and if this run dies mid-send the message comes back once the claim has run out.
 * The status stays `queued`, so no migration and no extra state.
 */
async function claimNext(
  db: Database,
  now: Date,
): Promise<{ message: Message; dueAt: Date } | null> {
  return db.transaction(async (tx) => {
    const [due] = await tx
      .select({ id: outboundMessage.id, sendAfter: outboundMessage.sendAfter })
      .from(outboundMessage)
      .where(
        and(
          eq(outboundMessage.channel, "email"),
          eq(outboundMessage.status, "queued"),
          lte(outboundMessage.sendAfter, now),
        ),
      )
      .orderBy(asc(outboundMessage.sendAfter), asc(outboundMessage.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!due) return null;
    const [message] = await tx
      .update(outboundMessage)
      .set({
        attempts: sql`${outboundMessage.attempts} + 1`,
        sendAfter: new Date(now.getTime() + CLAIM_TIMEOUT_MS),
      })
      .where(eq(outboundMessage.id, due.id))
      .returning();
    return message ? { message, dueAt: due.sendAfter } : null;
  });
}

/**
 * Delivers queued emails (`outbound_message`, channel email, status queued, `send_after` reached) through
 * the transport. Without `SMTP_HOST` the transport only logs (see `createMailTransport`). A failure keeps
 * the message queued with a growing delay; after `MAX_SEND_ATTEMPTS` it is `failed` with the error text.
 * Does nothing while `settings.email_enabled` is off (messages stay queued).
 * Each message is claimed before it is sent (`claimNext`), so overlapping runs never send it twice. The outcome is
 * only written while the claim is still this run's (same `attempts`), so a run that outlived its claim cannot
 * overwrite what a later run recorded.
 */
export async function sendQueuedEmails(
  db: Database,
  transport: MailTransport = createMailTransport(),
  now: Date = new Date(),
): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, retrying: 0 };
  // Master switch off: deliver nothing, leave already queued messages queued.
  if (!(await emailSettings(db)).emailEnabled) return result;

  for (let n = 0; n < BATCH; n++) {
    const claimed = await claimNext(db, now);
    if (!claimed) break;
    const { message, dueAt } = claimed;
    const stillOurs = and(
      eq(outboundMessage.id, message.id),
      eq(outboundMessage.status, "queued"),
      eq(outboundMessage.attempts, message.attempts),
    );

    try {
      if (!message.recipientAddress) throw new Error("no recipient address");
      const { externalId } = await transport.send({
        to: message.recipientAddress,
        subject: message.subject ?? "",
        text: message.renderedText,
      });
      await db
        .update(outboundMessage)
        // `send_after` goes back from the claim marker to when the message was due.
        .set({ status: "sent", sentAt: now, externalId, error: null, sendAfter: dueAt })
        .where(stillOurs);
      result.sent += 1;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const final = message.attempts >= MAX_SEND_ATTEMPTS || !message.recipientAddress;
      await db
        .update(outboundMessage)
        .set(
          final
            ? { status: "failed", error: text }
            : {
                error: text,
                sendAfter: new Date(now.getTime() + message.attempts * BACKOFF_MS),
              },
        )
        .where(stillOurs);
      if (final) result.failed += 1;
      else result.retrying += 1;
    }
  }
  return result;
}
