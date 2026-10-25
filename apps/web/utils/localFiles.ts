import { convertImage, outputName, type ImageFormat } from "./image";
import {
  MAX_TOTAL_BYTES,
  uniqueNames,
  validateFiles,
  type LocalResult,
  type PdfMode,
  type ArchiveMode,
  type TextMode,
  type ToolId,
} from "./tools";
import type { DocumentJob, DocumentFile } from "./documents";
import type { MediaOptions } from "./mediaPlan";
export interface LocalOptions {
  tool: ToolId;
  imageFormat: ImageFormat;
  imageEdge: number;
  imageQuality: number;
  pdfMode: PdfMode;
  pages: string;
  media: MediaOptions;
  imageRotation: number;
  imageFlip: "none" | "horizontal" | "vertical";
  archiveMode: ArchiveMode;
  pdfFormat: "image/png" | "image/jpeg";
  pdfDpi: number;
  pdfRotation: number;
  textMode: TextMode;
  spreadsheetSafe: boolean;
  hashAlgorithm: "SHA-256" | "SHA-384" | "SHA-512";
  expectedHash: string;
}

export function runDocumentWorker(
  job: DocumentJob,
  signal: AbortSignal,
): Promise<DocumentFile[]> {
  signal.throwIfAborted();
  const worker = new Worker(
    new URL("../workers/files.worker.ts", import.meta.url),
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
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      clean();
      reject(new Error("This took too long. Try fewer or smaller files."));
    }, 60_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      clean();
      reject(
        new Error("This file could not be processed. Try a smaller file."),
      );
    };
    worker.onmessage = ({ data }) => {
      clean();
      if (data.error) reject(new Error(data.error));
      else if (
        data.result.reduce(
          (sum: number, file: DocumentFile) => sum + file.bytes.byteLength,
          0,
        ) > MAX_TOTAL_BYTES
      )
        reject(new Error("The result exceeds 100 MiB. Try fewer files."));
      else resolve(data.result);
    };
    worker.postMessage(
      job,
      job.files.map((file) => file.bytes.buffer as ArrayBuffer),
    );
  });
}

export async function convertLocalFiles(
  files: File[],
  options: LocalOptions,
  signal: AbortSignal,
  status: (message: string) => void,
): Promise<LocalResult[]> {
  validateFiles(files, options.tool, options.pdfMode, options.archiveMode);
  signal.throwIfAborted();
  if (options.tool === "image") {
    const results: LocalResult[] = [];
    let total = 0;
    for (const [index, file] of files.entries()) {
      signal.throwIfAborted();
      status(`Converting image ${index + 1} of ${files.length}…`);
      const result = await convertImage(
        file,
        options.imageFormat,
        options.imageEdge,
        options.imageQuality,
        options.imageRotation,
        options.imageFlip,
      );
      total += result.blob.size;
      if (total > MAX_TOTAL_BYTES)
        throw new Error(
          "The results exceed 100 MiB. Choose smaller dimensions or fewer images.",
        );
      results.push({
        blob: result.blob,
        name: outputName(
          file.name,
          options.imageFormat === "image/jpeg"
            ? "jpg"
            : options.imageFormat.split("/")[1]!,
        ),
        detail: `${result.width} × ${result.height}`,
      });
    }
    const names = uniqueNames(results.map((result) => result.name));
    return results.map((result, index) => ({ ...result, name: names[index]! }));
  }
  if (["audio", "audio-format", "video"].includes(options.tool)) {
    const { convertMedia } = await import("./media");
    signal.throwIfAborted();
    return [await convertMedia(files[0]!, options.media, signal, status)];
  }
  if (
    options.tool === "pdf" &&
    (options.pdfMode === "render" || options.pdfMode === "text")
  ) {
    const { readPdf } = await import("./pdfRead");
    signal.throwIfAborted();
    return readPdf(
      files[0]!,
      {
        mode: options.pdfMode,
        pages: options.pages,
        format: options.pdfFormat,
        dpi: options.pdfDpi,
      },
      signal,
      status,
    );
  }
  status("Processing on your device…");
  const prepared: DocumentJob["files"] = [];
  let total = 0;
  for (const file of files) {
    signal.throwIfAborted();
    const blob =
      options.tool === "pdf" && options.pdfMode === "images"
        ? (await convertImage(file, "image/png", 0, 100)).blob
        : file;
    total += blob.size;
    if (total > MAX_TOTAL_BYTES)
      throw new Error(
        "The prepared images exceed 100 MiB. Resize them first or choose fewer images.",
      );
    prepared.push({
      name: file.name,
      type: blob.type,
      bytes: new Uint8Array(await blob.arrayBuffer()),
    });
  }
  const result = await runDocumentWorker(
    {
      kind:
        options.tool === "zip"
          ? (
              {
                create: "zip",
                extract: "unzip",
                gzip: "gzip",
                gunzip: "gunzip",
              } as const
            )[options.archiveMode]
          : options.tool === "text"
            ? "text"
            : options.tool === "hash"
              ? "hash"
              : "pdf",
      mode: options.pdfMode,
      pages: options.pages,
      files: prepared,
      rotation: options.pdfRotation,
      textMode: options.textMode,
      spreadsheetSafe: options.spreadsheetSafe,
      hashAlgorithm: options.hashAlgorithm,
      expectedHash: options.expectedHash,
    },
    signal,
  );
  const names = uniqueNames(result.map((file) => file.name));
  return result.map((file, index) => ({
    blob: new Blob([new Uint8Array(file.bytes)], { type: file.type }),
    name: names[index]!,
    detail: file.detail,
    preview: file.preview,
  }));
}

export async function zipResults(
  results: LocalResult[],
  signal: AbortSignal,
): Promise<LocalResult> {
  const files = [];
  for (const result of results) {
    signal.throwIfAborted();
    files.push({
      name: result.name,
      type: result.blob.type,
      bytes: new Uint8Array(await result.blob.arrayBuffer()),
    });
  }
  const [result] = await runDocumentWorker(
    { kind: "zip", mode: "merge", pages: "", files },
    signal,
  );
  return {
    blob: new Blob([new Uint8Array(result!.bytes)], { type: result!.type }),
    name: "converted-files.zip",
    detail: result!.detail,
  };
}
