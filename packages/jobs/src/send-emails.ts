import { type Database, outboundMessage } from "@marktwerk/db";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { createMailTransport, type MailTransport } from "./mail/transport";

/** A message is tried this many times, then marked `failed`. */
export const MAX_SEND_ATTEMPTS = 5;
const BATCH = 50;
/** Wait before the next try: attempts x 10 minutes. */
const BACKOFF_MS = 10 * 60 * 1000;

export type SendResult = { sent: number; failed: number; retrying: number };

/**
 * Delivers queued emails (`outbound_message`, channel email, status queued, `send_after` reached) through
 * the transport. Without `SMTP_HOST` the transport only logs (see `createMailTransport`). A failure keeps
 * the message queued with a growing delay; after `MAX_SEND_ATTEMPTS` it is `failed` with the error text.
 * A message is claimed by raising `attempts` conditionally, so two overlapping runs never send it twice.
 */
export async function sendQueuedEmails(
  db: Database,
  transport: MailTransport = createMailTransport(),
  now: Date = new Date(),
): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, retrying: 0 };
  const candidates = await db
    .select({ id: outboundMessage.id, attempts: outboundMessage.attempts })
    .from(outboundMessage)
    .where(
      and(
        eq(outboundMessage.channel, "email"),
        eq(outboundMessage.status, "queued"),
        lte(outboundMessage.sendAfter, now),
      ),
    )
    .orderBy(asc(outboundMessage.sendAfter))
    .limit(BATCH);

  for (const candidate of candidates) {
    const [message] = await db
      .update(outboundMessage)
      .set({ attempts: sql`${outboundMessage.attempts} + 1` })
      .where(
        and(
          eq(outboundMessage.id, candidate.id),
          eq(outboundMessage.status, "queued"),
          eq(outboundMessage.attempts, candidate.attempts),
        ),
      )
      .returning();
    if (!message) continue; // another run took it

    try {
      if (!message.recipientAddress) throw new Error("no recipient address");
      const { externalId } = await transport.send({
        to: message.recipientAddress,
        subject: message.subject ?? "",
        text: message.renderedText,
      });
      await db
        .update(outboundMessage)
        .set({ status: "sent", sentAt: now, externalId, error: null })
        .where(eq(outboundMessage.id, message.id));
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
        .where(eq(outboundMessage.id, message.id));
      if (final) result.failed += 1;
      else result.retrying += 1;
    }
  }
  return result;
}
