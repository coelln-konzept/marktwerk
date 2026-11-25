import { describe, expect, it } from "vitest";
import {
  bareAddress,
  fenceMail,
  isAllowlisted,
  type MailFence,
  ORIGINAL_TO_HEADER,
  parseAppEnv,
  parseMailAllowlist,
  parseMailFence,
} from "./fence";

const fence = (patch: Partial<MailFence> = {}): MailFence => ({
  appEnv: "preview",
  allowlist: ["arda@firma.test", "@team.test"],
  catchAll: "catch-all@marktwerk.test",
  ...patch,
});

describe("parseAppEnv", () => {
  it("defaults to local when unset or empty", () => {
    expect(parseAppEnv(undefined)).toBe("local");
    expect(parseAppEnv("")).toBe("local");
    expect(parseAppEnv("  ")).toBe("local");
  });

  it("accepts the three environments", () => {
    expect(parseAppEnv("local")).toBe("local");
    expect(parseAppEnv("preview")).toBe("preview");
    expect(parseAppEnv(" production ")).toBe("production");
  });

  it("refuses anything else, including near misses", () => {
    expect(() => parseAppEnv("prod")).toThrow(/APP_ENV must be one of local, preview, production/);
    expect(() => parseAppEnv("Production")).toThrow(/APP_ENV/);
    expect(() => parseAppEnv("staging")).toThrow(/APP_ENV/);
  });
});

describe("parseMailAllowlist", () => {
  it("splits on commas, trims, lower-cases and drops empty entries and duplicates", () => {
    expect(parseMailAllowlist(" Arda@Firma.test, @Team.test,, arda@firma.test ,")).toEqual([
      "arda@firma.test",
      "@team.test",
    ]);
  });

  it("is empty when unset", () => {
    expect(parseMailAllowlist(undefined)).toEqual([]);
    expect(parseMailAllowlist("")).toEqual([]);
  });

  it("refuses entries that are neither an address nor an @domain", () => {
    expect(() => parseMailAllowlist("firma.test")).toThrow(/"firma.test" is neither/);
    expect(() => parseMailAllowlist("@firma")).toThrow(/neither/);
    expect(() => parseMailAllowlist("a b@firma.test")).toThrow(/neither/);
    expect(() => parseMailAllowlist("@")).toThrow(/neither/);
  });
});

describe("isAllowlisted", () => {
  const list = ["arda@firma.test", "@team.test"];

  it("matches exact addresses and whole domains, ignoring case and display names", () => {
    expect(isAllowlisted("arda@firma.test", list)).toBe(true);
    expect(isAllowlisted("ARDA@Firma.Test", list)).toBe(true);
    expect(isAllowlisted("Arda <arda@firma.test>", list)).toBe(true);
    expect(isAllowlisted("jemand@team.test", list)).toBe(true);
  });

  it("does not match other people of an address-only domain, subdomains or look-alikes", () => {
    expect(isAllowlisted("anna@firma.test", list)).toBe(false);
    expect(isAllowlisted("x@sub.team.test", list)).toBe(false);
    expect(isAllowlisted("x@team.test.evil.test", list)).toBe(false);
    expect(isAllowlisted("arda@firma.test.evil.test", list)).toBe(false);
    expect(isAllowlisted("team.test", list)).toBe(false);
  });

  it("matches nothing with an empty list", () => {
    expect(isAllowlisted("arda@firma.test", [])).toBe(false);
  });
});

describe("bareAddress", () => {
  it("takes the address out of a display form", () => {
    expect(bareAddress("Anna Test <Anna@Example.test>")).toBe("anna@example.test");
    expect(bareAddress(" anna@example.test ")).toBe("anna@example.test");
  });
});

describe("parseMailFence", () => {
  it("reads the three variables", () => {
    expect(
      parseMailFence({
        APP_ENV: "preview",
        MAIL_ALLOWLIST: "@team.test",
        MAIL_CATCH_ALL: " catch-all@marktwerk.test ",
      }),
    ).toEqual({
      appEnv: "preview",
      allowlist: ["@team.test"],
      catchAll: "catch-all@marktwerk.test",
    });
  });

  it("defaults to local with no allowlist and no catch-all", () => {
    expect(parseMailFence({})).toEqual({ appEnv: "local", allowlist: [], catchAll: null });
  });

  it("refuses an invalid catch-all", () => {
    expect(() => parseMailFence({ MAIL_CATCH_ALL: "Catch <all@marktwerk.test>" })).toThrow(
      /MAIL_CATCH_ALL must be a plain address/,
    );
  });
});

describe("fenceMail", () => {
  it("production sends unchanged, even to unlisted recipients and without a catch-all", () => {
    expect(
      fenceMail(fence({ appEnv: "production", catchAll: null, allowlist: [] }), {
        to: "anna@example.test",
        subject: "Fällig: Genehmigung",
      }),
    ).toEqual({ to: "anna@example.test", subject: "Fällig: Genehmigung", headers: {} });
  });

  it("preview: an unlisted recipient goes to the catch-all, keeps the original in a header", () => {
    expect(fenceMail(fence(), { to: "anna@example.test", subject: "Fällig" })).toEqual({
      to: "catch-all@marktwerk.test",
      subject: "[preview] Fällig",
      headers: { [ORIGINAL_TO_HEADER]: "anna@example.test" },
    });
  });

  it("local: same rule, with the [local] prefix", () => {
    expect(
      fenceMail(fence({ appEnv: "local" }), { to: "anna@example.test", subject: "Hallo" }),
    ).toEqual({
      to: "catch-all@marktwerk.test",
      subject: "[local] Hallo",
      headers: { [ORIGINAL_TO_HEADER]: "anna@example.test" },
    });
  });

  it("an allowlisted recipient keeps the address but still gets the prefix", () => {
    expect(fenceMail(fence(), { to: "Arda@Firma.test", subject: "Hallo" })).toEqual({
      to: "Arda@Firma.test",
      subject: "[preview] Hallo",
      headers: {},
    });
    expect(fenceMail(fence(), { to: "ben@team.test", subject: "Hallo" }).to).toBe("ben@team.test");
  });

  it("does not prefix twice", () => {
    expect(fenceMail(fence(), { to: "x@example.test", subject: "[preview] Hallo" }).subject).toBe(
      "[preview] Hallo",
    );
  });

  it("refuses to send outside production without a catch-all, also to allowlisted recipients", () => {
    expect(() =>
      fenceMail(fence({ catchAll: null }), { to: "anna@example.test", subject: "x" }),
    ).toThrow(/MAIL_CATCH_ALL must be set when APP_ENV is "preview"/);
    expect(() =>
      fenceMail(fence({ appEnv: "local", catchAll: null }), {
        to: "arda@firma.test",
        subject: "x",
      }),
    ).toThrow(/APP_ENV is "local"/);
  });
});
