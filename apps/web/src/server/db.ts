import "server-only";
import { createDb, type Database } from "@marktwerk/db";
import { env } from "./env";

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { db?: Database };

// Serverless instances each hold their own pool, so keep it small there.
export const db =
  globalForDb.db ?? createDb(env.DATABASE_URL, { max: process.env.VERCEL ? 3 : 10 });

if (env.NODE_ENV !== "production") globalForDb.db = db;
