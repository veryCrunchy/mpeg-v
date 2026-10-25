import { createError, getHeader, setHeader, type H3Event } from "h3";
import { Buffer } from "node:buffer";

/** Limit while reading, including chunked requests without Content-Length. */
export async function readBoundedBody(
  event: H3Event,
  limit: number,
): Promise<Buffer> {
  const length = Number(getHeader(event, "content-length"));
  if (length > limit)
    throw createError({
      statusCode: 413,
      statusMessage: "This file is too large.",
    });
  const chunks: Buffer[] = [];
  let size = 0;
  const timeout = setTimeout(() => event.node.req.destroy(), 30_000);
  try {
    for await (const chunk of event.node.req.iterator({
      destroyOnReturn: false,
    })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > limit) {
        setHeader(event, "Connection", "close");
        throw createError({
          statusCode: 413,
          statusMessage: "This file is too large.",
        });
      }
      chunks.push(bytes);
    }
  } finally {
    clearTimeout(timeout);
  }
  if (!size)
    throw createError({
      statusCode: 400,
      statusMessage: "Choose a file first.",
    });
  return Buffer.concat(chunks, size);
}

const active = new Set<string>();
const windows = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit = 6, now = Date.now()) {
  for (const [id, entry] of windows) if (entry.reset <= now) windows.delete(id);
  const entry = windows.get(key) ?? { count: 0, reset: now + 60_000 };
  if (entry.count >= limit || windows.size >= 10_000)
    throw createError({
      statusCode: 429,
      statusMessage: "Please wait a minute before trying again.",
    });
  entry.count++;
  windows.set(key, entry);
}
export async function withUserJob<T>(
  id: string,
  work: () => Promise<T>,
): Promise<T> {
  if (active.has(id) || active.size >= 4)
    throw createError({
      statusCode: 429,
      statusMessage: "A file is already processing. Try again shortly.",
    });
  rateLimit(`job:${id}`);
  active.add(id);
  try {
    return await work();
  } finally {
    active.delete(id);
  }
}

export function mediaType(bytes: Uint8Array): string | undefined {
  const ascii = (from: number, to: number) =>
    new TextDecoder().decode(bytes.slice(from, to));
  if (
    bytes[0] === 0x89 &&
    ascii(1, 4) === "PNG" &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  )
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp") return "video/mp4";
}
