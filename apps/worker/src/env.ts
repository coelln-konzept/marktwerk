function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  APP_TIMEZONE: process.env.APP_TIMEZONE ?? "Europe/Berlin",
};
