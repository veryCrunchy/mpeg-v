import {
  type FileToolRequest,
  validateFileRequest,
} from "../mpeg-v/types/fileTools.ts";
import { validateAttachmentUrl } from "./generate.ts";
import { errorResponse, HttpError, readJson, readLimited } from "./http.ts";
import { withConversionSlot } from "./converter.ts";
import { convertNative } from "./nativeFiles.ts";
import { preferencesStore } from "./preferencesStore.ts";
import { resolveAudioVideo } from "../web/utils/core/audioVideo.ts";
import {
  type ArchiveMode,
  type PdfMode,
  type TextMode,
  uniqueNames,
  validateFiles,
} from "../web/utils/core/tools.ts";
import type { DocumentFile, DocumentJob } from "../web/utils/core/documents.ts";

// Web APIs require an ordinary ArrayBuffer, even if a worker supplied a shared view.
function responseBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes);
}

export function documentJob(
  job: DocumentJob,
  signal: AbortSignal,
  archiveMode?: string,
  entry?: string,
): Promise<DocumentFile[]> {
  signal.throwIfAborted();
  const worker = new Worker(
    new URL("./fileJob.worker.ts", import.meta.url).href,
    { type: "module" },
  );
  return new Promise((resolve, reject) => {
    const clean = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      clean();
      reject(new HttpError(499, "File processing cancelled."));
    };
    const timer = setTimeout(() => {
      clean();
      reject(new HttpError(504, "This took too long. Try a smaller file."));
    }, 60_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      event.preventDefault();
      clean();
      reject(new HttpError(422, "These files could not be processed."));
    };
    worker.onmessage = ({ data }) => {
      clean();
      if (data.error) reject(new HttpError(422, data.error));
      else resolve(data.result);
    };
    worker.postMessage(
      { job, archiveMode, entry },
      job.files.map((file) => file.bytes.buffer as ArrayBuffer),
    );
  });
}

export async function processBotFiles(
  request: FileToolRequest,
  files: DocumentFile[],
  signal: AbortSignal,
): Promise<DocumentFile> {
  const options = { ...request.options };
  const operation = request.operation;
  if (operation === "audio" && options.format === "waveform") {
    options.audioVideo = request.actor
      ? preferencesStore().resolve(
        request.actor.userId,
        request.actor.guildId,
        options.audioVideo,
      )
      : resolveAudioVideo(options.audioVideo);
    if (options.bitrate !== undefined) {
      options.audioVideo.bitrate = options.bitrate as 64 | 128 | 192 | 256;
    }
  }
  if (operation !== "info") {
    try {
      validateFiles(
        files.map((file) => ({
          name: file.name,
          size: file.bytes.length,
        })) as File[],
        operation === "audio"
          ? "audio-format"
          : operation === "archive"
          ? "zip"
          : operation === "checksum"
          ? "hash"
          : operation,
        (options.mode ?? "merge") as PdfMode,
        (options.mode === "list"
          ? "extract"
          : options.mode ?? "create") as ArchiveMode,
      );
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
  }
  if (["image", "audio", "video"].includes(operation)) {
    return convertNative(
      files[0]!,
      operation,
      options,
      request.maxOutputBytes,
      signal,
    );
  }
  if (operation === "info") {
    const file = files[0]!;
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", responseBytes(file.bytes)),
      ),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    return {
      name: "file-info.json",
      type: "application/json",
      bytes: new TextEncoder().encode(
        JSON.stringify(
          { filename: file.name, bytes: file.bytes.length, sha256: hash },
          null,
          2,
        ),
      ),
    };
  }
  if (operation === "pdf" && options.mode === "images") {
    for (let i = 0; i < files.length; i++) {
      files[i] = await convertNative(
        files[i]!,
        "image",
        { format: "png", edge: 2560 },
        25 * 1024 * 1024,
        signal,
      );
    }
  }
  let results = await documentJob(
    {
      kind: operation === "pdf"
        ? "pdf"
        : operation === "text"
        ? "text"
        : operation === "checksum"
        ? "hash"
        : options.mode === "gzip"
        ? "gzip"
        : options.mode === "gunzip"
        ? "gunzip"
        : "zip",
      mode: (options.mode ?? "merge") as PdfMode,
      pages: options.pages ?? "",
      files,
      rotation: options.rotation ?? 90,
      textMode: (options.mode ?? "json-format") as TextMode,
      spreadsheetSafe: true,
      hashAlgorithm: (options.format ?? "SHA-256") as "SHA-256",
      expectedHash: options.expected,
    },
    signal,
    operation === "archive" ? options.mode : undefined,
    options.entry,
  );
  if (
    results.reduce((sum, file) => sum + file.bytes.length, 0) >
      100 * 1024 * 1024
  ) {
    throw new HttpError(
      413,
      "Results exceed 100 MiB. Select fewer pages or files.",
    );
  }
  if (results.length > 1) {
    results = await documentJob({
      kind: "zip",
      mode: "merge",
      pages: "",
      files: results,
    }, signal);
  }
  return results[0]!;
}

export async function handleFileTools(req: Request): Promise<Response> {
  try {
    return await withConversionSlot(async () => {
      let request: FileToolRequest;
      try {
        request = validateFileRequest(await readJson(req));
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, (error as Error).message);
      }
      const urls = request.files.map((file) => validateAttachmentUrl(file.url));
      const signal = AbortSignal.any([
        req.signal,
        AbortSignal.timeout(120_000),
      ]);
      const files: DocumentFile[] = [];
      let total = 0;
      try {
        for (const [index, url] of urls.entries()) {
          const remaining = 100 * 1024 * 1024 - total;
          const response = await fetch(url, { signal, redirect: "error" });
          if (!response.ok || !response.body) {
            await response.body?.cancel();
            throw new HttpError(
              422,
              "This attachment could not be downloaded. Attach the file again.",
            );
          }
          if (Number(response.headers.get("content-length")) > remaining) {
            await response.body.cancel();
            throw new HttpError(
              413,
              "Choose files totaling no more than 100 MiB.",
            );
          }
          const bytes = await readLimited(response.body, remaining, signal);
          total += bytes.length;
          files.push({
            name: request.files[index]!.name,
            type: "application/octet-stream",
            bytes,
          });
        }
        const result = await processBotFiles(request, files, signal);
        signal.throwIfAborted();
        if (result.bytes.length > request.maxOutputBytes) {
          throw new HttpError(
            413,
            "The result exceeds Discord's attachment limit. Try fewer pages, a smaller size or a shorter clip.",
          );
        }
        return new Response(responseBytes(result.bytes), {
          headers: {
            "Content-Type": result.type,
            "Content-Length": String(result.bytes.length),
            "X-File-Name": encodeURIComponent(uniqueNames([result.name])[0]!),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch (error) {
        if (signal.aborted) {
          throw new HttpError(
            504,
            "File processing was cancelled or timed out.",
          );
        }
        throw error;
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
