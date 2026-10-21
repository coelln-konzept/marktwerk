import net from "node:net";
import { createLogTransport, createMailTransport, sendSmtp } from "@marktwerk/jobs";
import { afterEach, describe, expect, it } from "vitest";

/** A tiny SMTP server that records what a client says, with a hook to refuse a command. */
async function fakeServer(options: { refuse?: string } = {}) {
  const received: string[] = [];
  let data = "";
  const server = net.createServer((socket) => {
    let inData = false;
    let buffer = "";
    socket.on("error", () => {});
    socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          data = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          socket.write("250 queued as 42\r\n");
          continue;
        }
        const eol = buffer.indexOf("\r\n");
        if (eol === -1) return;
        const line = buffer.slice(0, eol);
        buffer = buffer.slice(eol + 2);
        received.push(line);
        const verb = line.split(" ")[0]?.toUpperCase() ?? "";
        if (options.refuse && line.toUpperCase().startsWith(options.refuse)) {
          socket.write("550 refused\r\n");
        } else if (verb === "EHLO") socket.write("250-fake\r\n250-SIZE 1000\r\n250 AUTH PLAIN\r\n");
        else if (verb === "AUTH") socket.write("235 ok\r\n");
        else if (verb === "DATA") {
          inData = true;
          socket.write("354 go\r\n");
        } else if (verb === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  return { port, received, data: () => data, close: () => new Promise((r) => server.close(r)) };
}

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

  it("uses SMTP_* from the environment", async () => {
    running = await fakeServer();
    const transport = createMailTransport({
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
  });
});
