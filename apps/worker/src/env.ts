import { parseMailFence } from "@marktwerk/jobs";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Validated at startup so a typo in APP_ENV / MAIL_ALLOWLIST / MAIL_CATCH_ALL stops the worker (ADR 0023). */
const mailFence = parseMailFence(process.env);

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  APP_TIMEZONE: process.env.APP_TIMEZONE ?? "Europe/Berlin",
  APP_ENV: mailFence.appEnv,
};
