import net from "node:net";
import tls from "node:tls";

/**
 * A small SMTP client (RFC 5321) for plain text mail: implicit TLS (port 465) or plain/STARTTLS, AUTH PLAIN.
 * It exists because no mail library is a dependency of the project yet; swapping it for nodemailer later only
 * means replacing `createSmtpTransport`'s `send`.
 */
export type SmtpConfig = {
  host: string;
  port: number;
  /** Implicit TLS from the first byte (port 465). */
  secure: boolean;
  user?: string;
  password?: string;
  /** Name announced in EHLO. */
  clientName?: string;
  timeoutMs?: number;
};

export type SmtpMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  messageId: string;
  date?: Date;
};

type Reply = { code: number; lines: string[] };

class Connection {
  private socket: net.Socket | tls.TLSSocket;
  private buffer = "";
  private pendingLines: string[] = [];
  private replies: Reply[] = [];
  private waiter: { resolve: (r: Reply) => void; reject: (e: Error) => void } | null = null;
  private failure: Error | null = null;

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket;
    this.attach(socket);
  }

  private attach(socket: net.Socket | tls.TLSSocket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("error", (error) => this.fail(error));
    socket.on("timeout", () => this.fail(new Error("SMTP timeout")));
    socket.on("close", () => this.fail(new Error("SMTP connection closed")));
  }

  private fail(error: Error) {
    this.failure ??= error;
    this.waiter?.reject(this.failure);
    this.waiter = null;
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\r\n");
    while (index !== -1) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 2);
      this.pendingLines.push(line);
      // The last line of a reply has a space (or nothing) after the code, earlier ones a dash.
      if (/^\d{3}( |$)/.test(line)) {
        this.replies.push({ code: Number(line.slice(0, 3)), lines: this.pendingLines });
        this.pendingLines = [];
        if (this.waiter) {
          const waiter = this.waiter;
          this.waiter = null;
          const reply = this.replies.shift();
          if (reply) waiter.resolve(reply);
        }
      }
      index = this.buffer.indexOf("\r\n");
    }
  }

  read(): Promise<Reply> {
    const ready = this.replies.shift();
    if (ready) return Promise.resolve(ready);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  write(data: string) {
    this.socket.write(data);
  }

  /** STARTTLS: wraps the open socket. */
  upgrade(host: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.removeAllListeners("data");
      this.socket.removeAllListeners("close");
      const secured = tls.connect({ socket: this.socket as net.Socket, servername: host });
      secured.setTimeout(timeoutMs);
      secured.once("secureConnect", () => resolve());
      secured.once("error", reject);
      this.socket = secured;
      this.buffer = "";
      this.attach(secured);
    });
  }

  close() {
    this.socket.destroy();
  }
}

function open(config: SmtpConfig): Promise<Connection> {
  const timeout = config.timeoutMs ?? 20_000;
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });
    socket.setTimeout(timeout);
    socket.once("error", reject);
    socket.once(config.secure ? "secureConnect" : "connect", () => {
      socket.off("error", reject);
      resolve(new Connection(socket));
    });
  });
}

async function expectReply(conn: Connection, ok: number[], context: string): Promise<Reply> {
  const reply = await conn.read();
  if (!ok.includes(reply.code)) throw new Error(`SMTP ${context}: ${reply.lines.join(" | ")}`);
  return reply;
}

async function command(
  conn: Connection,
  line: string,
  ok: number[],
  context = line.split(" ")[0] ?? line,
) {
  conn.write(`${line}\r\n`);
  return expectReply(conn, ok, context);
}

const noBreaks = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

/** `Name <a@b.c>` → `a@b.c`; throws if the address looks wrong (also keeps header injection out). */
export function addressOf(value: string): string {
  const match = /<([^<>\s]+)>/.exec(value);
  const address = (match?.[1] ?? value).trim();
  if (!/^[^\s@<>"]+@[^\s@<>"]+$/.test(address)) throw new Error(`Invalid mail address: ${value}`);
  return address;
}

/** RFC 2047 encoded word for non-ASCII subjects. */
function encodeHeader(value: string): string {
  const clean = noBreaks(value);
  return /^[\x20-\x7e]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

const wrap76 = (base64: string) => base64.replace(/(.{76})/g, "$1\r\n");

/** The full message (headers + base64 body), CRLF line ends. */
export function buildMessage(message: SmtpMessage): string {
  const date = (message.date ?? new Date()).toUTCString();
  return [
    `From: ${noBreaks(message.from)}`,
    `To: ${noBreaks(message.to)}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${date}`,
    `Message-ID: <${noBreaks(message.messageId)}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(message.text.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64")),
  ].join("\r\n");
}

/** Sends one message. Rejects on any non-success reply. */
export async function sendSmtp(config: SmtpConfig, message: SmtpMessage): Promise<void> {
  const from = addressOf(message.from);
  const to = addressOf(message.to);
  const clientName = config.clientName ?? "marktwerk.local";
  const timeout = config.timeoutMs ?? 20_000;
  const conn = await open(config);
  try {
    await expectReply(conn, [220], "greeting");
    let ehlo = await command(conn, `EHLO ${clientName}`, [250], "EHLO");
    const offersTls = ehlo.lines.some((l) => /STARTTLS/i.test(l));
    if (!config.secure && offersTls && config.user) {
      await command(conn, "STARTTLS", [220]);
      await conn.upgrade(config.host, timeout);
      ehlo = await command(conn, `EHLO ${clientName}`, [250], "EHLO");
    }
    if (config.user) {
      const credentials = Buffer.from(`\0${config.user}\0${config.password ?? ""}`, "utf8");
      await command(conn, `AUTH PLAIN ${credentials.toString("base64")}`, [235], "AUTH");
    }
    await command(conn, `MAIL FROM:<${from}>`, [250], "MAIL FROM");
    await command(conn, `RCPT TO:<${to}>`, [250, 251], "RCPT TO");
    await command(conn, "DATA", [354]);
    conn.write(`${buildMessage(message)}\r\n.\r\n`);
    await expectReply(conn, [250], "message");
    // Saying goodbye is polite but not essential: a lost reply must not fail a mail that was accepted.
    conn.write("QUIT\r\n");
    await conn.read().catch(() => undefined);
  } finally {
    conn.close();
  }
}
