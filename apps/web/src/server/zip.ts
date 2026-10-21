import "server-only";
import { crc32, deflateRawSync } from "node:zlib";

/**
 * A minimal ZIP writer (no dependency): UTF-8 names, "stored" or "deflate", no ZIP64, so at most 65,535
 * entries and 4 GB. Entries are produced one at a time, so a month of receipts never sits in memory
 * as a whole.
 */
export type ZipEntry = {
  /** Path inside the archive, forward slashes. */
  name: string;
  /** Reads the content when it is this entry's turn. */
  read: () => Promise<Uint8Array> | Uint8Array;
  /** Deflate the content (text); photos and PDFs are stored as they are. */
  compress?: boolean;
  modifiedAt?: Date;
};

const UTF8_FLAG = 0x0800;
const MAX_ENTRIES = 0xffff;
const MAX_SIZE = 0xffffffff;

function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

type Written = {
  name: Buffer;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  offset: number;
  time: number;
  day: number;
};

function localHeader(w: Written): Buffer {
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(UTF8_FLAG, 6);
  h.writeUInt16LE(w.method, 8);
  h.writeUInt16LE(w.time, 10);
  h.writeUInt16LE(w.day, 12);
  h.writeUInt32LE(w.crc, 14);
  h.writeUInt32LE(w.compressedSize, 18);
  h.writeUInt32LE(w.size, 22);
  h.writeUInt16LE(w.name.length, 26);
  h.writeUInt16LE(0, 28);
  return Buffer.concat([h, w.name]);
}

function centralHeader(w: Written): Buffer {
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(20, 6);
  h.writeUInt16LE(UTF8_FLAG, 8);
  h.writeUInt16LE(w.method, 10);
  h.writeUInt16LE(w.time, 12);
  h.writeUInt16LE(w.day, 14);
  h.writeUInt32LE(w.crc, 16);
  h.writeUInt32LE(w.compressedSize, 20);
  h.writeUInt32LE(w.size, 24);
  h.writeUInt16LE(w.name.length, 28);
  // extra, comment, disk, internal and external attributes stay 0
  h.writeUInt32LE(w.offset, 42);
  return Buffer.concat([h, w.name]);
}

/** The archive as a stream of chunks (a response body). */
export function zipStream(entries: readonly ZipEntry[]): ReadableStream<Uint8Array> {
  if (entries.length > MAX_ENTRIES) throw new RangeError("too many entries for a zip file");
  const central: Buffer[] = [];
  let offset = 0;
  let next = 0;
  let done = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (done) return;
      if (next < entries.length) {
        const entry = entries[next++] as ZipEntry;
        const content = Buffer.from(await entry.read());
        const stored = entry.compress ? deflateRawSync(content) : content;
        const { time, day } = dosDateTime(entry.modifiedAt ?? new Date());
        if (stored.length > MAX_SIZE || offset > MAX_SIZE)
          throw new RangeError("zip entry too large");
        const written: Written = {
          name: Buffer.from(entry.name, "utf8"),
          method: entry.compress ? 8 : 0,
          crc: crc32(content),
          compressedSize: stored.length,
          size: content.length,
          offset,
          time,
          day,
        };
        const header = localHeader(written);
        central.push(centralHeader(written));
        offset += header.length + stored.length;
        controller.enqueue(header);
        controller.enqueue(stored);
        return;
      }
      const directory = Buffer.concat(central);
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(entries.length, 8);
      end.writeUInt16LE(entries.length, 10);
      end.writeUInt32LE(directory.length, 12);
      end.writeUInt32LE(offset, 16);
      controller.enqueue(directory);
      controller.enqueue(end);
      done = true;
      controller.close();
    },
  });
}

/** The whole archive in memory (tests, small bundles). */
export async function zipBuffer(entries: readonly ZipEntry[]): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const reader = zipStream(entries).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
