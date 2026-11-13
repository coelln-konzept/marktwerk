// node:test instead of Vitest: this package has no test runner and the build script must stay dependency-free.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideBuildMigration } from "./migrate-gate.ts";

describe("decideBuildMigration", () => {
  it("migrates outside Vercel (local, CI), as before", () => {
    assert.equal(decideBuildMigration({}).migrate, true);
    assert.equal(decideBuildMigration({ VERCEL_ENV: "" }).migrate, true);
    assert.equal(decideBuildMigration({ MIGRATE_ON_PREVIEW: "0" }).migrate, true);
  });

  it("migrates production builds", () => {
    const decision = decideBuildMigration({ VERCEL_ENV: "production" });
    assert.equal(decision.migrate, true);
    assert.match(decision.message, /production/);
  });

  it("skips preview builds without the opt-in and says why", () => {
    const decision = decideBuildMigration({ VERCEL_ENV: "preview" });
    assert.equal(decision.migrate, false);
    assert.match(
      decision.message,
      /^\[migrate\] Skipped: Vercel preview build without MIGRATE_ON_PREVIEW=1\. /,
    );
  });

  it("migrates preview builds that opt in (branch environment with its own database)", () => {
    const decision = decideBuildMigration({ VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: "1" });
    assert.equal(decision.migrate, true);
    assert.match(decision.message, /MIGRATE_ON_PREVIEW=1/);
  });

  it("only accepts 1 as the opt-in and names the ignored value", () => {
    for (const value of ["true", "yes", "0", "on"]) {
      const decision = decideBuildMigration({ VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: value });
      assert.equal(decision.migrate, false);
      assert.ok(decision.message.includes(`MIGRATE_ON_PREVIEW is "${value}"`), decision.message);
    }
  });

  it("treats other Vercel environments like previews", () => {
    assert.equal(decideBuildMigration({ VERCEL_ENV: "development" }).migrate, false);
    assert.equal(
      decideBuildMigration({ VERCEL_ENV: "development", MIGRATE_ON_PREVIEW: "1" }).migrate,
      true,
    );
  });
});
