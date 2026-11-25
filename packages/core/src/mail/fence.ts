import { isValidEmail } from "../text/email";

/**
 * Outbound mail fence (ADR 0023). Outside production no mail may reach a real person by accident: every recipient
 * not on `MAIL_ALLOWLIST` is rewritten to `MAIL_CATCH_ALL`, the original recipient is kept in a header, and the
 * subject says where the mail came from. Production sends unchanged.
 */

/** Where this deployment runs. Drives the mail fence; anything but `production` is fenced. */
export const APP_ENVS = ["local", "preview", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** Header that carries the recipient a fenced mail was meant for. */
export const ORIGINAL_TO_HEADER = "X-Marktwerk-Original-To";

/** `APP_ENV`: one of `APP_ENVS`, `local` when unset or empty. Throws on any other value. */
export function parseAppEnv(value: string | undefined): AppEnv {
  const env = value?.trim() || "local";
  if (!(APP_ENVS as readonly string[]).includes(env))
    throw new Error(`APP_ENV must be one of ${APP_ENVS.join(", ")} (got "${env}")`);
  return env as AppEnv;
}

/** `Name <a@b.de>` → `a@b.de`, lower case. */
export function bareAddress(value: string): string {
  const match = /<([^<>]+)>/.exec(value);
  return (match?.[1] ?? value).trim().toLowerCase();
}

const DOMAIN = /^@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/;

/**
 * `MAIL_ALLOWLIST`: comma-separated addresses (`anna@firma.test`) and whole domains (`@firma.test`), case-insensitive.
 * A domain entry matches that exact domain, not its subdomains. Throws on an entry that is neither.
 */
export function parseMailAllowlist(value: string | undefined): string[] {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  for (const entry of entries) {
    const ok = entry.startsWith("@") ? DOMAIN.test(entry) : isValidEmail(entry);
    if (!ok) throw new Error(`MAIL_ALLOWLIST: "${entry}" is neither an address nor an @domain`);
  }
  return [...new Set(entries)];
}

export function isAllowlisted(address: string, allowlist: readonly string[]): boolean {
  const bare = bareAddress(address);
  const at = bare.lastIndexOf("@");
  if (at <= 0) return false;
  return allowlist.includes(bare) || allowlist.includes(bare.slice(at));
}

export type MailFence = {
  appEnv: AppEnv;
  allowlist: readonly string[];
  /** Where fenced mail goes. Required outside production before anything is sent. */
  catchAll: string | null;
};

/** Reads `APP_ENV`, `MAIL_ALLOWLIST` and `MAIL_CATCH_ALL`. Throws on an invalid value (not on a missing catch-all). */
export function parseMailFence(env: Readonly<Record<string, string | undefined>>): MailFence {
  const catchAll = env.MAIL_CATCH_ALL?.trim() || null;
  if (catchAll && !isValidEmail(catchAll))
    throw new Error(`MAIL_CATCH_ALL must be a plain address (got "${catchAll}")`);
  return {
    appEnv: parseAppEnv(env.APP_ENV),
    allowlist: parseMailAllowlist(env.MAIL_ALLOWLIST),
    catchAll,
  };
}

export type FencedMail = {
  to: string;
  subject: string;
  /** Extra headers for the message (the original recipient when it was rewritten). */
  headers: Record<string, string>;
};

/**
 * Applies the fence to one outgoing mail. Production: unchanged. Elsewhere: the subject gets `[local]` / `[preview]`,
 * a recipient off the allowlist is replaced by the catch-all (original kept in `ORIGINAL_TO_HEADER`). Without a
 * catch-all nothing may be sent outside production, so it throws.
 */
export function fenceMail(fence: MailFence, mail: { to: string; subject: string }): FencedMail {
  if (fence.appEnv === "production") return { to: mail.to, subject: mail.subject, headers: {} };
  if (!fence.catchAll)
    throw new Error(
      `Mail refused: MAIL_CATCH_ALL must be set when APP_ENV is "${fence.appEnv}" (outbound mail fence, ADR 0023)`,
    );
  const prefix = `[${fence.appEnv}]`;
  const subject = mail.subject.startsWith(prefix) ? mail.subject : `${prefix} ${mail.subject}`;
  if (isAllowlisted(mail.to, fence.allowlist)) return { to: mail.to, subject, headers: {} };
  return { to: fence.catchAll, subject, headers: { [ORIGINAL_TO_HEADER]: mail.to } };
}
