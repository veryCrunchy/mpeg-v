import { pageSelection } from "./pdfPages.ts";
import { degrees, PDFDocument } from "pdf-lib";
import { zipSync } from "fflate";
import {
  MAX_TOTAL_BYTES,
  type PdfMode,
  type TextMode,
  uniqueNames,
} from "./tools.ts";
import { outputName } from "./filenames.ts";
import { extractZip, gzipFile } from "./archives.ts";
import { processText } from "./textTools.ts";
export interface DocumentFile {
  name: string;
  bytes: Uint8Array;
  type: string;
  detail?: string;
  preview?: string;
}
export interface DocumentJob {
  kind: "pdf" | "zip" | "unzip" | "gzip" | "gunzip" | "text" | "hash";
  mode: PdfMode;
  pages: string;
  files: DocumentFile[];
  rotation?: number;
  textMode?: TextMode;
  spreadsheetSafe?: boolean;
  hashAlgorithm?: "SHA-256" | "SHA-384" | "SHA-512";
  expectedHash?: string;
}

export async function processDocuments(job: DocumentJob) {
  if (
    !job.files.length ||
    job.files.length > 20 ||
    job.files.reduce((sum, file) => sum + file.bytes.byteLength, 0) >
      MAX_TOTAL_BYTES
  ) {
    throw new Error("Choose up to 20 files totaling no more than 100 MiB.");
  }
  if (job.kind === "zip") {
    const entries = Object.create(null) as Record<string, Uint8Array>;
    const names = uniqueNames(job.files.map((file) => file.name));
    job.files.forEach((file, index) => {
      entries[names[index]!] = file.bytes;
    });
    return {
      bytes: zipSync(entries, { level: 6 }),
      type: "application/zip",
      detail: `${job.files.length} ${
        job.files.length === 1 ? "file" : "files"
      }`,
    };
  }
  if (!["merge", "images"].includes(job.mode) && job.files.length !== 1) {
    throw new Error("Choose one PDF to select pages.");
  }
  const output = await PDFDocument.create();
  for (const file of job.files) {
    if (job.mode === "images") {
      const image = file.type === "image/jpeg"
        ? await output.embedJpg(file.bytes)
        : await output.embedPng(file.bytes);
      // 96 pixels per inch, with sensible page sizes for larger images.
      const scale = Math.min(0.75, 1440 / Math.max(image.width, image.height));
      const width = image.width * scale,
        height = image.height * scale;
      output
        .addPage([width, height])
        .drawImage(image, { x: 0, y: 0, width, height });
    } else {
      let source: PDFDocument;
      try {
        source = await PDFDocument.load(file.bytes, { updateMetadata: false });
      } catch {
        throw new Error(
          "This PDF could not be opened. Use an unencrypted, undamaged PDF.",
        );
      }
      const count = source.getPageCount();
      if (
        !count ||
        count > 200 ||
        (output.getPageCount() + count > 200 && job.mode === "merge")
      ) {
        throw new Error("Combine no more than 200 PDF pages at a time.");
      }
      const selected = pageSelection(
        ["extract", "rotate"].includes(job.mode) ? job.pages : "",
        count,
      );
      const indices = job.mode === "extract"
        ? selected
        : pageSelection("", count);
      const pages = await output.copyPages(source, indices);
      if (
        job.mode === "rotate" && ![90, 180, 270].includes(job.rotation ?? 0)
      ) {
        throw new Error("Choose a valid rotation.");
      }
      pages.forEach((page, index) => {
        if (job.mode === "rotate" && selected.includes(index)) {
          page.setRotation(
            degrees((page.getRotation().angle + job.rotation!) % 360),
          );
        }
        output.addPage(page);
      });
    }
  }
  return {
    bytes: await output.save(),
    type: "application/pdf",
    detail: `${output.getPageCount()} pages`,
  };
}

export async function processFileJob(
  job: DocumentJob,
): Promise<DocumentFile[]> {
  if (
    !job.files.length ||
    job.files.length > (job.kind === "zip" ? 200 : 20) ||
    job.files.reduce((sum, file) => sum + file.bytes.length, 0) >
      MAX_TOTAL_BYTES
  ) {
    throw new Error("The selected files exceed this tool's limits.");
  }
  const first = job.files[0]!;
  if (
    ["unzip", "gzip", "gunzip", "text"].includes(job.kind) &&
    job.files.length !== 1
  ) {
    throw new Error("Choose one input file.");
  }
  if (job.kind === "unzip") return extractZip(first.bytes);
  if (job.kind === "gzip" || job.kind === "gunzip") {
    return [await gzipFile(first, job.kind === "gunzip")];
  }
  if (job.kind === "text") {
    return [processText(first, job.textMode!, job.spreadsheetSafe)];
  }
  if (job.kind === "hash") {
    const algorithm = job.hashAlgorithm ?? "SHA-256";
    if (!["SHA-256", "SHA-384", "SHA-512"].includes(algorithm)) {
      throw new Error("Choose a supported hash algorithm.");
    }
    const expected = job.expectedHash?.trim().toLowerCase() ?? "";
    const hexLength = { "SHA-256": 64, "SHA-384": 96, "SHA-512": 128 }[
      algorithm
    ];
    if (
      expected &&
      (!/^[a-f0-9]+$/.test(expected) ||
        expected.length !== hexLength ||
        job.files.length !== 1)
    ) {
      throw new Error(
        "Compare one file with a hexadecimal checksum of the chosen length.",
      );
    }
    const lines: string[] = [];
    for (const file of job.files) {
      const digest = await crypto.subtle.digest(
        algorithm,
        new Uint8Array(file.bytes),
      );
      const hash = Array.from(
        new Uint8Array(digest),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      lines.push(`${hash}  ${file.name.replace(/[\r\n\x00-\x1f]/g, "_")}`);
      if (expected) {
        lines.push(
          hash === expected
            ? "MATCH: The checksum matches."
            : "MISMATCH: The checksum does not match.",
        );
      }
    }
    const preview = `${algorithm}\n\n${lines.join("\n")}`;
    return [
      {
        name: `${algorithm.toLowerCase()}-checksums.txt`,
        bytes: new TextEncoder().encode(preview + "\n"),
        type: "text/plain",
        preview,
      },
    ];
  }
  if (job.kind === "pdf" && job.mode === "split") {
    if (job.files.length !== 1) throw new Error("Choose one PDF to split.");
    let source: PDFDocument;
    try {
      source = await PDFDocument.load(first.bytes, { updateMetadata: false });
    } catch {
      throw new Error(
        "This PDF could not be opened. Use an unencrypted, undamaged PDF.",
      );
    }
    const results: DocumentFile[] = [];
    for (const index of pageSelection(job.pages, source.getPageCount())) {
      const output = await PDFDocument.create();
      const [page] = await output.copyPages(source, [index]);
      output.addPage(page!);
      results.push({
        name: outputName(first.name, `page-${index + 1}.pdf`),
        bytes: await output.save(),
        type: "application/pdf",
        detail: `Page ${index + 1}`,
      });
      if (
        results.reduce((sum, file) => sum + file.bytes.length, 0) >
          MAX_TOTAL_BYTES
      ) {
        throw new Error("The split files exceed 100 MiB. Select fewer pages.");
      }
    }
    return results;
  }
  // Result bundles may contain up to 200 pages or extracted entries.
  if (job.kind === "zip" && job.files.length > 20) {
    const entries = Object.create(null),
      names = uniqueNames(job.files.map((file) => file.name));
    job.files.forEach((file, index) => {
      entries[names[index]!] = file.bytes;
    });
    return [
      { name: "files.zip", bytes: zipSync(entries), type: "application/zip" },
    ];
  }
  const result = await processDocuments(job);
  const name = job.kind === "zip"
    ? "files.zip"
    : job.mode === "extract"
    ? outputName(first.name, "selected.pdf")
    : job.mode === "rotate"
    ? outputName(first.name, "rotated.pdf")
    : job.mode === "images"
    ? "images.pdf"
    : "merged.pdf";
  return [{ ...result, name }];
}
