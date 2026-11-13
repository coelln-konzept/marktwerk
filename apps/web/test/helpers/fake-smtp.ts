import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import tls from "node:tls";

/** A throwaway self-signed certificate for 127.0.0.1 (needs `openssl`, as on macOS and the CI runner). */
export function selfSignedCert(): { key: string; cert: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "marktwerk-tls-"));
  try {
    const key = path.join(dir, "key.pem");
    const cert = path.join(dir, "cert.pem");
    execFileSync(
      "openssl",
      [
        ...["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes"],
        ...["-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=127.0.0.1"],
        ...["-addext", "subjectAltName=IP:127.0.0.1"],
      ],
      { stdio: "ignore" },
    );
    return { key: readFileSync(key, "utf8"), cert: readFileSync(cert, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A tiny SMTP server that records what a client says, with a hook to refuse a command. With `tls` it offers
 * STARTTLS; `tlsFrom()` is the index in `received` of the first line that came over TLS (null: none did).
 */
export async function fakeSmtpServer(
  options: { refuse?: string; tls?: { key: string; cert: string } } = {},
) {
  const received: string[] = [];
  let data = "";
  let tlsFrom: number | null = null;
  const serve = (socket: net.Socket | tls.TLSSocket, secure: boolean) => {
    let inData = false;
    let buffer = "";
    socket.on("error", () => {});
    const onData = (chunk: Buffer) => {
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
        if (secure && tlsFrom === null) tlsFrom = received.length;
        received.push(line);
        const verb = line.split(" ")[0]?.toUpperCase() ?? "";
        if (options.refuse && line.toUpperCase().startsWith(options.refuse)) {
          socket.write("550 refused\r\n");
        } else if (verb === "EHLO") {
          const starttls = options.tls && !secure ? "250-STARTTLS\r\n" : "";
          socket.write(`250-fake\r\n250-SIZE 1000\r\n${starttls}250 AUTH PLAIN\r\n`);
        } else if (verb === "STARTTLS" && options.tls && !secure) {
          socket.off("data", onData);
          socket.write("220 go ahead\r\n", () => {
            const secured = new tls.TLSSocket(socket, { isServer: true, ...options.tls });
            serve(secured, true);
          });
          return;
        } else if (verb === "AUTH") socket.write("235 ok\r\n");
        else if (verb === "DATA") {
          inData = true;
          socket.write("354 go\r\n");
        } else if (verb === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("250 ok\r\n");
      }
    };
    socket.on("data", onData);
  };
  const server = net.createServer((socket) => {
    socket.write("220 fake ESMTP\r\n");
    serve(socket, false);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    port,
    received,
    data: () => data,
    tlsFrom: () => tlsFrom,
    close: () => new Promise((r) => server.close(r)),
  };
}

/** Header block and decoded (base64) body of the last message the fake server received. */
export function parseReceived(raw: string) {
  const [head = "", body = ""] = raw.split("\r\n\r\n");
  const header = (name: string) => new RegExp(`^${name}: (.*)$`, "m").exec(head)?.[1] ?? null;
  return { head, header, text: Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8") };
}
