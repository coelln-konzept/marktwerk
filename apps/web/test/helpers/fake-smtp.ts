import net from "node:net";

/** A tiny SMTP server that records what a client says, with a hook to refuse a command. */
export async function fakeSmtpServer(options: { refuse?: string } = {}) {
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

/** Header block and decoded (base64) body of the last message the fake server received. */
export function parseReceived(raw: string) {
  const [head = "", body = ""] = raw.split("\r\n\r\n");
  const header = (name: string) => new RegExp(`^${name}: (.*)$`, "m").exec(head)?.[1] ?? null;
  return { head, header, text: Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8") };
}
