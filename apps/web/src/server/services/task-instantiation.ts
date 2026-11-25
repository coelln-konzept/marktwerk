import "server-only";

/**
 * The instantiation path lives in @marktwerk/jobs so the nightly `event-seasons` job can use the same code as
 * "Markt planen" and template propagation (one service path, CLAUDE.md). Re-exported here for the web services.
 */
export * from "@marktwerk/jobs/task-instantiation";
