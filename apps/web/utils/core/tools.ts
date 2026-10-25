export const tools = [
  {
    id: "image",
    label: "Image converter",
    description: "Convert, resize, rotate and flip",
    icon: "image",
    formats: "PNG · JPEG · WebP · GIF · AVIF · BMP",
  },
  {
    id: "audio",
    label: "Audio to video",
    description: "Turn a sound into a waveform clip",
    icon: "audio",
    formats: "Audio → MP4",
  },
  {
    id: "audio-format",
    label: "Audio converter",
    description: "Change format or extract from video",
    icon: "audio",
    formats: "MP3 · WAV · FLAC · OGG · M4A",
  },
  {
    id: "video",
    label: "Video converter",
    description: "Convert, trim, mute or capture a frame",
    icon: "video",
    formats: "MP4 · WebM · GIF · PNG/JPEG frames",
  },
  {
    id: "pdf",
    label: "PDF tools",
    description: "Merge, split, rotate, images and text",
    icon: "file",
    formats: "PDF ↔ Images · PDF → Text",
  },
  {
    id: "zip",
    label: "Archive tools",
    description: "Create and extract ZIP or GZIP",
    icon: "archive",
    formats: "ZIP · GZIP",
  },
  {
    id: "text",
    label: "Text & data",
    description: "JSON, CSV, TSV, Base64 and text",
    icon: "file",
    formats: "JSON · CSV · TSV · TXT · Base64",
  },
  {
    id: "hash",
    label: "File checksums",
    description: "Calculate and compare SHA hashes",
    icon: "file",
    formats: "SHA-256 · SHA-384 · SHA-512",
  },
] as const;
export type ToolId = (typeof tools)[number]["id"];
export const imageExtensions = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;
export const audioExtensions = /\.(mp3|wav|flac|aac|m4a|ogg|opus)$/i;
export const videoExtensions = /\.(mp4|webm|mov|mkv|avi|m4v|gif)$/i;
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export type PdfMode =
  | "merge"
  | "extract"
  | "images"
  | "render"
  | "text"
  | "split"
  | "rotate";
export type ArchiveMode = "create" | "extract" | "gzip" | "gunzip";
export type TextMode =
  | "json-format"
  | "json-minify"
  | "csv-json"
  | "tsv-json"
  | "json-csv"
  | "json-tsv"
  | "base64-encode"
  | "base64-decode"
  | "lines-sort"
  | "lines-unique"
  | "lines-lf"
  | "lines-crlf";
export function allowsMultiple(
  tool: ToolId,
  pdfMode: PdfMode,
  archiveMode: ArchiveMode = "create",
) {
  return (
    tool === "image" ||
    tool === "hash" ||
    (tool === "zip" && archiveMode === "create") ||
    (tool === "pdf" && ["merge", "images"].includes(pdfMode))
  );
}
export interface LocalResult {
  blob: Blob;
  name: string;
  detail?: string;
  preview?: string;
}
export function validateFiles(
  files: File[],
  tool: ToolId,
  pdfMode: PdfMode = "merge",
  archiveMode: ArchiveMode = "create",
) {
  const multiple = allowsMultiple(tool, pdfMode, archiveMode);
  if (!files.length || files.length > (multiple ? 20 : 1))
    throw new Error(
      multiple
        ? "Choose between 1 and 20 files."
        : "Choose one file for this tool.",
    );
  let total = 0;
  for (const file of files) {
    const limit =
      tool === "text"
        ? 10 * 1024 * 1024
        : ["image", "pdf"].includes(tool)
          ? 25 * 1024 * 1024
          : MAX_TOTAL_BYTES;
    if (
      (!file.size && !["zip", "text", "hash"].includes(tool)) ||
      file.size > limit
    )
      throw new Error(
        `Each file must be between 1 byte and ${limit / 1024 / 1024} MiB.`,
      );
    total += file.size;
    const accepted =
      tool === "text" ||
      tool === "hash" ||
      (tool === "zip" &&
        (archiveMode === "create" ||
          archiveMode === "gzip" ||
          (archiveMode === "extract"
            ? /\.zip$/i.test(file.name)
            : /\.(gz|gzip)$/i.test(file.name)))) ||
      ((tool === "image" || (tool === "pdf" && pdfMode === "images")) &&
        imageExtensions.test(file.name)) ||
      (tool === "audio" && audioExtensions.test(file.name)) ||
      (tool === "audio-format" &&
        (audioExtensions.test(file.name) || videoExtensions.test(file.name))) ||
      (tool === "video" && videoExtensions.test(file.name)) ||
      (tool === "pdf" && pdfMode !== "images" && /\.pdf$/i.test(file.name));
    if (!accepted)
      throw new Error(`“${file.name}” is not a supported input for this tool.`);
  }
  if (total > MAX_TOTAL_BYTES)
    throw new Error("Choose files totaling no more than 100 MiB.");
}

export function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  return names.map((original) => {
    let safe =
      original
        .replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, "_")
        .replace(/^\.+/, "")
        .slice(0, 140)
        .replace(/[. ]+$/, "") || "file";
    // ZIP libraries may use ordinary objects internally for their entry maps.
    if (["__proto__", "constructor", "prototype"].includes(safe))
      safe = `file-${safe}`;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe))
      safe = `file-${safe}`;
    const dot = safe.lastIndexOf(".");
    const stem = dot > 0 ? safe.slice(0, dot) : safe;
    const suffix = dot > 0 ? safe.slice(dot) : "";
    let name = safe,
      index = 1;
    while (seen.has(name.toLowerCase())) name = `${stem} (${++index})${suffix}`;
    seen.add(name.toLowerCase());
    return name;
  });
}
