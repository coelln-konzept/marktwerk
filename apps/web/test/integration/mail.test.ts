import { createLogTransport, createMailTransport, sendSmtp } from "@marktwerk/jobs";
import { afterEach, describe, expect, it } from "vitest";
import { fakeSmtpServer as fakeServer, parseReceived } from "../helpers/fake-smtp";

let running: Awaited<ReturnType<typeof fakeServer>> | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
});

describe("sendSmtp", () => {
  it("sends one UTF-8 mail with the envelope, authentication and a base64 body", async () => {
    running = await fakeServer();
    await sendSmtp(
      { host: "127.0.0.1", port: running.port, secure: false },
      {
        from: "marktwerk <noreply@marktwerk.local>",
        to: "anna@test.local",
        subject: "Fällig: Genehmigung für Köln",
        text: "Hallo Anna,\n\n. Punkt am Zeilenanfang\nÜberfällig!",
        messageId: "abc@marktwerk.local",
        date: new Date("2026-10-21T10:00:00Z"),
      },
    );
    expect(running.received).toContain("MAIL FROM:<noreply@marktwerk.local>");
    expect(running.received).toContain("RCPT TO:<anna@test.local>");
    expect(running.received.at(-1)).toBe("QUIT");
    const raw = running.data();
    const [head, body] = raw.split("\r\n\r\n") as [string, string];
    expect(head).toContain("From: marktwerk <noreply@marktwerk.local>");
    expect(head).toContain("To: anna@test.local");
    expect(head).toContain("Message-ID: <abc@marktwerk.local>");
    expect(head).toContain("Content-Transfer-Encoding: base64");
    const subject = /Subject: =\?UTF-8\?B\?(.+)\?=/.exec(head)?.[1] ?? "";
    expect(Buffer.from(subject, "base64").toString("utf8")).toBe("Fällig: Genehmigung für Köln");
    expect(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe(
      "Hallo Anna,\r\n\r\n. Punkt am Zeilenanfang\r\nÜberfällig!",
    );
  });

  it("authenticates with AUTH PLAIN when a user is configured", async () => {
    running = await fakeServer();
    await sendSmtp(
      { host: "127.0.0.1", port: running.port, secure: false, user: "mailer", password: "s3cret" },
      { from: "a@b.de", to: "c@d.de", subject: "x", text: "y", messageId: "m@b.de" },
    );
    const auth = running.received.find((l) => l.startsWith("AUTH PLAIN "));
    expect(Buffer.from(auth?.slice(11) ?? "", "base64").toString("utf8")).toBe("\0mailer\0s3cret");
  });

  it("rejects when the server refuses the recipient, and refuses bad addresses and header injection", async () => {
    running = await fakeServer({ refuse: "RCPT" });
    await expect(
      sendSmtp(
        { host: "127.0.0.1", port: running.port, secure: false },
        { from: "a@b.de", to: "c@d.de", subject: "x", text: "y", messageId: "m@b.de" },
      ),
    ).rejects.toThrow(/SMTP RCPT TO: 550 refused/);
    await expect(
      sendSmtp(
        { host: "127.0.0.1", port: running.port, secure: false },
        { from: "a@b.de", to: "c@d.de\r\nBcc: x@y.de", subject: "x", text: "y", messageId: "m" },
      ),
    ).rejects.toThrow(/Invalid mail address/);
  });

  it("fails when nothing listens", async () => {
    const probe = await fakeServer();
    const { port } = probe;
    await probe.close();
    await expect(
      sendSmtp(
        { host: "127.0.0.1", port, secure: false },
        { from: "a@b.de", to: "c@d.de", subject: "x", text: "y", messageId: "m" },
      ),
    ).rejects.toThrow();
  });
});

describe("createMailTransport", () => {
  it("logs instead of sending when SMTP_HOST is not set", async () => {
    const lines: string[] = [];
    const transport = createLogTransport((line) => lines.push(line));
    const { externalId } = await transport.send({ to: "a@b.de", subject: "Hallo", text: "x" });
    expect(externalId.startsWith("log:")).toBe(true);
    expect(lines[0]).toContain("to=a@b.de");
    expect(createMailTransport({}).name).toBe("log");
  });

  it("uses SMTP_* from the environment; production sends unchanged", async () => {
    running = await fakeServer();
    const transport = createMailTransport({
      APP_ENV: "production",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(running.port),
      SMTP_FROM: "marktwerk <noreply@marktwerk.local>",
    });
    expect(transport.name).toBe("smtp");
    const { externalId } = await transport.send({
      to: "anna@test.local",
      subject: "Hi",
      text: "Text",
    });
    expect(externalId).toMatch(/@marktwerk\.local$/);
    expect(running.received).toContain("RCPT TO:<anna@test.local>");
    const mail = parseReceived(running.data());
    expect(mail.header("To")).toBe("anna@test.local");
    expect(mail.header("Subject")).toBe("Hi");
    expect(mail.header("X-Marktwerk-Original-To")).toBeNull();
  });
});

describe("outbound mail fence (ADR 0023)", () => {
  const smtpEnv = (port: number, fence: Record<string, string>) => ({
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(port),
    SMTP_FROM: "marktwerk <noreply@marktwerk.test>",
    ...fence,
  });

  it("preview: an address off the allowlist lands in the catch-all, the original in a header", async () => {
    running = await fakeServer();
    const transport = createMailTransport(
      smtpEnv(running.port, {
        APP_ENV: "preview",
        MAIL_ALLOWLIST: "arda@firma.test,@team.test",
        MAIL_CATCH_ALL: "catch-all@marktwerk.test",
      }),
    );
    await transport.send({ to: "anna@example.test", subject: "Fällig", text: "Text" });
    expect(running.received).toContain("RCPT TO:<catch-all@marktwerk.test>");
    expect(running.received.join("\n")).not.toContain("anna@example.test");
    const mail = parseReceived(running.data());
    expect(mail.header("To")).toBe("catch-all@marktwerk.test");
    expect(mail.header("X-Marktwerk-Original-To")).toBe("anna@example.test");
    const subject = /=\?UTF-8\?B\?(.+)\?=/.exec(mail.header("Subject") ?? "")?.[1] ?? "";
    expect(Buffer.from(subject, "base64").toString("utf8")).toBe("[preview] Fällig");
    expect(mail.text).toBe("Text");
  });

  it("local: an allowlisted address (or domain) gets the mail itself, with the [local] prefix", async () => {
    running = await fakeServer();
    const transport = createMailTransport(
      smtpEnv(running.port, {
        MAIL_ALLOWLIST: "@team.test",
        MAIL_CATCH_ALL: "catch-all@marktwerk.test",
      }),
    );
    await transport.send({ to: "ben@team.test", subject: "Hallo", text: "Text" });
    expect(running.received).toContain("RCPT TO:<ben@team.test>");
    const mail = parseReceived(running.data());
    expect(mail.header("Subject")).toBe("[local] Hallo");
    expect(mail.header("X-Marktwerk-Original-To")).toBeNull();
  });

  it("refuses to send outside production without MAIL_CATCH_ALL, before connecting", async () => {
    running = await fakeServer();
    const transport = createMailTransport(
      smtpEnv(running.port, { APP_ENV: "preview", MAIL_ALLOWLIST: "@team.test" }),
    );
    await expect(
      transport.send({ to: "ben@team.test", subject: "Hallo", text: "Text" }),
    ).rejects.toThrow(/MAIL_CATCH_ALL must be set/);
    expect(running.received).toEqual([]);
  });

  it("refuses an invalid APP_ENV or allowlist when the transport is created", () => {
    expect(() => createMailTransport(smtpEnv(25, { APP_ENV: "prod" }))).toThrow(/APP_ENV/);
    expect(() => createMailTransport(smtpEnv(25, { MAIL_ALLOWLIST: "team.test" }))).toThrow(
      /MAIL_ALLOWLIST/,
    );
  });
});
