import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * File storage behind one small interface (ADR 0015: documents are immutable). Production uses an EU
 * S3-compatible bucket (`STORAGE_DRIVER=s3`, not wired up yet), development and tests use plain files
 * under `./.data/files`. Keys are chosen by the caller and are never reused: a stored file is never
 * overwritten, only added and (for soft-deleted documents, never) removed.
 */
export interface StorageDriver {
  /** Stores the bytes under `key`. Refuses to overwrite an existing key. */
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** The bytes of `key`; throws `StorageNotFoundError` when missing. */
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
}

export class StorageNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`stored file not found: ${key}`);
  }
}

export class StorageNotConfiguredError extends Error {
  constructor(driver: string) {
    super(`storage driver "${driver}" is not configured`);
  }
}

/** sha-256 of the bytes as 64 lower-case hex characters. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * `<first two hex chars of the hash>/<hash>-<document id>.<ext>`: the prefix spreads files over
 * directories, the id makes the key unique even when the same bytes are uploaded twice.
 */
export function storageKeyFor(sha256: string, documentId: string, ext: string): string {
  return `${sha256.slice(0, 2)}/${sha256}-${documentId}.${ext}`;
}

const KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f]{64}-[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

/** Files under a directory (default `./.data/files`, relative to the web app). */
export function createLocalStorage(root: string): StorageDriver {
  const base = path.resolve(root);
  // The key shape is fixed, so a path can never leave `base`.
  const resolve = (key: string) => {
    if (!KEY_PATTERN.test(key)) throw new Error(`invalid storage key: ${key}`);
    return path.join(base, ...key.split("/"));
  };
  return {
    async put(key, bytes) {
      const file = resolve(key);
      await mkdir(path.dirname(file), { recursive: true });
      // "wx" fails if the file exists. A crash can leave a partial file under a key no document points to;
      // keys carry the document id and are never reused, so that is harmless.
      await writeFile(file, bytes, { flag: "wx" });
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(resolve(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StorageNotFoundError(key);
        throw error;
      }
    },
    async exists(key) {
      try {
        await stat(resolve(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** S3-compatible bucket in an EU region. Stub until hosting is decided (ADR 0006): every call throws. */
export function createS3Storage(): StorageDriver {
  const fail = async (): Promise<never> => {
    throw new StorageNotConfiguredError("s3");
  };
  return { put: fail, get: fail, exists: fail };
}

let override: StorageDriver | null = null;
let cached: StorageDriver | null = null;

/** The configured storage driver (`STORAGE_DRIVER`), created once per process. */
export function getStorage(): StorageDriver {
  if (override) return override;
  if (!cached) {
    cached =
      env.STORAGE_DRIVER === "s3"
        ? createS3Storage()
        : createLocalStorage(env.STORAGE_LOCAL_DIR ?? path.resolve(process.cwd(), ".data/files"));
  }
  return cached;
}

/** Tests: use another driver (a temp directory) for the rest of the process; `null` resets. */
export function setStorageForTests(driver: StorageDriver | null) {
  override = driver;
}
