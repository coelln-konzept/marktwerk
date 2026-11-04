/**
 * Spam rules for the shared mailboxes (ADR 0014: fixed rules, no AI). A person can always override with
 * "Kein Spam"; "Spam" also blocks the sender. Content rules need two signals so one phrase alone never
 * hides a real vendor's mail.
 */
export type SpamReason =
  | "blocked_sender"
  | "honeypot"
  | "impossible_data"
  | "spam_phrase"
  | "many_links";

const PHRASES =
  /\b(seo|ranking|backlinks?|casino|bitcoin|krypto|crypto|viagra|gewinnspiel|sie haben gewonnen|lottery|click here|jetzt klicken|kredit ohne schufa)\b/i;
const LINK = /https?:\/\/\S+/gi;
/** The website form has a hidden "Website" field people never fill in; bots do. */
const HONEYPOT = /^\s*website:\s*\S+/im;
/** Longer than any row we have: not a real request. */
const MAX_PLAUSIBLE_CM = 5000;

export function spamCheck(
  mail: { fromAddress: string; subject: string; text: string; formLengthCm?: number | null },
  blockedSenders: readonly string[],
): { spam: boolean; reasons: SpamReason[] } {
  const from = mail.fromAddress.trim().toLowerCase();
  const blocked = blockedSenders.some((b) => {
    const x = b.trim().toLowerCase();
    return x.startsWith("@") ? from.endsWith(x) : from === x;
  });
  if (blocked) return { spam: true, reasons: ["blocked_sender"] };

  const hard: SpamReason[] = [];
  if (HONEYPOT.test(mail.text)) hard.push("honeypot");
  if (mail.formLengthCm && mail.formLengthCm > MAX_PLAUSIBLE_CM) hard.push("impossible_data");
  if (hard.length) return { spam: true, reasons: hard };

  const soft: SpamReason[] = [];
  if (PHRASES.test(`${mail.subject} ${mail.text}`)) soft.push("spam_phrase");
  if ((mail.text.match(LINK) ?? []).length >= 3) soft.push("many_links");
  return soft.length >= 2 ? { spam: true, reasons: soft } : { spam: false, reasons: [] };
}
