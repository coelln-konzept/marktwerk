-- Typo-tolerant command palette search (Strg+K): trigram similarity from pg_trgm (a trusted extension, available
-- on Supabase, Neon and the local Postgres image). Installed into our own schema `app`: `marktwerk_app` owns it,
-- while `public` is not writable for that role on Neon. The search code calls `app.word_similarity`.
--
-- No trigram indexes: the search compares umlaut-folded expressions over joined tables (event + venue, task +
-- event, …) that a column index cannot serve, and the typo pass runs only when nothing matches as typed
-- (measured locally: about 0.25 s for a full typo pass over 20,000 tasks; literal searches are unchanged).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA app;
