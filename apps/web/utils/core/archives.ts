import { Inflate } from "fflate";
import { MAX_TOTAL_BYTES, uniqueNames } from "./tools.ts";
import type { DocumentFile } from "./documents.ts";

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]!;
  return (crc ^ 0xffffffff) >>> 0;
}
export function joinChunks(chunks: Uint8Array[], length: number) {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

// Inspect the complete directory before allocating outputs. Then bound actual
// streaming inflation as well: forged sizes must never bypass the memory limit.
export function extractZip(bytes: Uint8Array): DocumentFile[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  const invalid = () =>
    new Error(
      "This ZIP is damaged or unsupported. Use an unencrypted ZIP with standard compression.",
    );
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557)) {
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length)
      break;
    end--;
  }
  if (end < 0 || end < bytes.length - 65557) throw invalid();
  const count = u16(end + 10),
    directorySize = u32(end + 12),
    directory = u32(end + 16);
  if (
    u16(end + 4) ||
    u16(end + 6) ||
    u16(end + 8) !== count ||
    count === 65535 ||
    directory + directorySize !== end
  )
    throw invalid();
  if (count > 200) throw new Error("Extract up to 200 ZIP entries at a time.");
  const entries: {
    name: string;
    start: number;
    size: number;
    original: number;
    crc: number;
    method: number;
  }[] = [];
  let cursor = directory,
    declared = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) throw invalid();
    const flags = u16(cursor + 8),
      method = u16(cursor + 10),
      size = u32(cursor + 20),
      original = u32(cursor + 24);
    const nameLength = u16(cursor + 28),
      next = cursor + 46 + nameLength + u16(cursor + 30) + u16(cursor + 32),
      local = u32(cursor + 42);
    if (
      next > end ||
      !nameLength ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      u16(cursor + 34)
    )
      throw invalid();
    if (
      local + 30 > directory ||
      u32(local) !== 0x04034b50 ||
      u16(local + 8) !== method ||
      u16(local + 6) & 1
    )
      throw invalid();
    const start = local + 30 + u16(local + 26) + u16(local + 28);
    if (
      start + size > directory ||
      start < local ||
      (method === 0 && size !== original)
    )
      throw invalid();
    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    declared += original;
    if (declared > MAX_TOTAL_BYTES)
      throw new Error("Extracted files must total no more than 100 MiB.");
    if (!name.endsWith("/"))
      entries.push({
        name,
        start,
        size,
        original,
        crc: u32(cursor + 16),
        method,
      });
    cursor = next;
  }
  if (cursor !== end) throw invalid();
  if (!entries.length) throw new Error("This ZIP contains no files.");
  const names = uniqueNames(entries.map((entry) => entry.name));
  let total = 0;
  return entries.map((entry, index) => {
    const compressed = bytes.subarray(entry.start, entry.start + entry.size);
    let result: Uint8Array;
    if (entry.method === 0) {
      result = compressed.slice();
      total += result.length;
    } else {
      const chunks: Uint8Array[] = [];
      let length = 0;
      const inflater = new Inflate((chunk) => {
        length += chunk.length;
        total += chunk.length;
        if (length > entry.original || total > MAX_TOTAL_BYTES)
          throw new Error(
            "This ZIP expands beyond its declared size or the 100 MiB limit.",
          );
        chunks.push(chunk);
      });
      for (let offset = 0; offset < compressed.length; offset += 1024)
        inflater.push(
          compressed.subarray(offset, offset + 1024),
          offset + 1024 >= compressed.length,
        );
      result = joinChunks(chunks, length);
    }
    if (result.length !== entry.original || crc32(result) !== entry.crc)
      throw invalid();
    // Extracted content is download-only, never interpreted as HTML or a preview.
    return {
      name: names[index]!,
      bytes: result,
      type: "application/octet-stream",
    };
  });
}

export async function gzipFile(
  file: DocumentFile,
  decompress: boolean,
): Promise<DocumentFile> {
  const stream = new Blob([new Uint8Array(file.bytes)])
    .stream()
    .pipeThrough(
      decompress
        ? new DecompressionStream("gzip")
        : new CompressionStream("gzip"),
    );
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_TOTAL_BYTES)
        throw new Error("The result exceeds 100 MiB.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof Error && /100 MiB/.test(error.message)) throw error;
    throw new Error(
      "This GZIP could not be opened. Check that it is undamaged.",
    );
  } finally {
    reader.releaseLock();
  }
  return {
    name: uniqueNames([
      decompress ? file.name.replace(/\.(gz|gzip)$/i, "") : `${file.name}.gz`,
    ])[0]!,
    type: decompress ? "application/octet-stream" : "application/gzip",
    bytes: joinChunks(chunks, length),
  };
}
