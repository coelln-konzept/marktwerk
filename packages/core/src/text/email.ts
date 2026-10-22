/** Pragmatic e-mail check: one "@", no spaces, a dot in the domain, sane length. Not a full RFC 5322 parser. */
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && EMAIL.test(email);
}
