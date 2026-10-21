import { randomUUID } from "node:crypto";
import { sendSmtp } from "./smtp";

export type MailMessage = {
  /** Address of the recipient, e.g. `anna@example.org`. */
  to: string;
  subject: string;
  text: string;
};

/** How outgoing mail leaves the system. Jobs only know this interface. */
export interface MailTransport {
  readonly name: "smtp" | "log" | (string & {});
  /** Returns an id the provider (or the log) gave the message. */
  send(message: MailMessage): Promise<{ externalId: string }>;
}

type Env = Record<string, string | undefined>;

const DEFAULT_FROM = "marktwerk <noreply@marktwerk.local>";

/** Used when `SMTP_HOST` is not set: writes the mail to the log instead of sending it. */
export function createLogTransport(log: (line: string) => void = console.log): MailTransport {
  return {
    name: "log",
    async send(message) {
      const externalId = `log:${randomUUID()}`;
      log(`[mail] (not sent, SMTP_HOST is not set) to=${message.to} subject="${message.subject}"`);
      return { externalId };
    },
  };
}

/** SMTP from the `SMTP_*` environment variables (see .env.example), or the log transport. */
export function createMailTransport(env: Env = process.env): MailTransport {
  const host = env.SMTP_HOST?.trim();
  if (!host) return createLogTransport();
  const port = Number(env.SMTP_PORT || 587);
  const from = env.SMTP_FROM?.trim() || DEFAULT_FROM;
  return {
    name: "smtp",
    async send(message) {
      const domain = from.split("@")[1]?.replace(/[>\s].*$/, "") ?? "marktwerk.local";
      const messageId = `${randomUUID()}@${domain}`;
      await sendSmtp(
        {
          host,
          port,
          secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
          user: env.SMTP_USER || undefined,
          password: env.SMTP_PASSWORD || undefined,
        },
        { from, ...message, messageId },
      );
      return { externalId: messageId };
    },
  };
}
