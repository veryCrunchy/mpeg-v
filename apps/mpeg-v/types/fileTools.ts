import {
  type AudioVideoSettings,
  validateAudioVideoPatch,
  validDiscordId,
} from "../../web/utils/core/audioVideo.ts";
export const fileOperations = [
  "image",
  "audio",
  "video",
  "pdf",
  "archive",
  "text",
  "checksum",
  "info",
] as const;
export type FileOperation = typeof fileOperations[number];
export interface FileToolOptions {
  audioVideo?: Partial<AudioVideoSettings>;
  format?: string;
  mode?: string;
  pages?: string;
  entry?: string;
  expected?: string;
  edge?: number;
  quality?: number;
  rotation?: number;
  flip?: string;
  start?: number;
  duration?: number;
  bitrate?: number;
  mute?: boolean;
  normalize?: boolean;
}
export interface FileToolRequest {
  operation: FileOperation;
  files: { name: string; url: string }[];
  options: FileToolOptions;
  maxOutputBytes: number;
  actor?: { userId: string; guildId?: string };
}
export function validateFileRequest(value: unknown): FileToolRequest {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid file request.");
  }
  const request = value as FileToolRequest;
  if (
    request.actor !== undefined &&
    (!request.actor || !validDiscordId(request.actor.userId) ||
      request.actor.guildId !== undefined &&
        !validDiscordId(request.actor.guildId))
  ) throw new Error("Invalid settings owner.");
  if (
    !fileOperations.includes(request.operation) ||
    !Array.isArray(request.files) || !request.files.length ||
    request.files.length > 5
  ) throw new Error("Choose a supported tool and between one and five files.");
  for (const file of request.files) {
    if (
      !file || typeof file.name !== "string" || file.name.length > 200 ||
      !file.name.length || typeof file.url !== "string" ||
      file.url.length > 4096
    ) throw new Error("Invalid attachment details.");
  }
  if (
    !Number.isInteger(request.maxOutputBytes) || request.maxOutputBytes < 1 ||
    request.maxOutputBytes > 100 * 1024 * 1024
  ) throw new Error("Invalid output limit.");
  const options = request.options ?? {};
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Invalid tool options.");
  }
  if (options.audioVideo !== undefined) {
    options.audioVideo = validateAudioVideoPatch(
      options.audioVideo,
      false,
    ) as Partial<AudioVideoSettings>;
  }
  const choices: Record<string, readonly (string | number)[]> = {
    image: ["png", "jpg", "webp"],
    audio: ["mp3", "wav", "flac", "ogg", "m4a", "waveform"],
    video: ["mp4", "webm", "gif", "png", "jpg"],
    pdf: ["merge", "extract", "split", "rotate", "images"],
    archive: ["create", "list", "extract", "gzip", "gunzip"],
    text: [
      "json-format",
      "json-minify",
      "csv-json",
      "tsv-json",
      "json-csv",
      "json-tsv",
      "base64-encode",
      "base64-decode",
      "lines-sort",
      "lines-unique",
      "lines-lf",
      "lines-crlf",
    ],
    checksum: ["SHA-256", "SHA-384", "SHA-512"],
  };
  if (
    options.format !== undefined &&
    !(choices[request.operation] ?? []).includes(options.format)
  ) throw new Error("Choose a supported output format.");
  if (
    options.mode !== undefined &&
    !(choices[request.operation] ?? []).includes(options.mode)
  ) throw new Error("Choose a supported operation.");
  for (const key of ["start", "duration"] as const) {
    if (
      options[key] !== undefined &&
      (!Number.isFinite(options[key]) || options[key]! < 0 ||
        options[key]! > 86400)
    ) throw new Error("Invalid start time or duration.");
  }
  for (
    const [key, values] of Object.entries({
      edge: [0, 480, 720, 800, 1080, 1280, 1920, 2560],
      quality: [23, 28, 33],
      rotation: [0, 90, 180, 270],
      flip: ["none", "horizontal", "vertical"],
      bitrate: [64, 128, 192, 256],
    })
  ) {
    if (
      key in options &&
      !(values as unknown[]).includes(options[key as keyof FileToolOptions])
    ) throw new Error(`Invalid ${key} option.`);
  }
  for (const key of ["mute", "normalize"] as const) {
    if (options[key] !== undefined && typeof options[key] !== "boolean") {
      throw new Error(`Invalid ${key} option.`);
    }
  }
  for (const key of ["pages", "entry", "expected"] as const) {
    if (
      options[key] !== undefined &&
      (typeof options[key] !== "string" ||
        options[key]!.length > (key === "pages" ? 1000 : 200))
    ) throw new Error(`Invalid ${key} option.`);
  }
  const multiple = request.operation === "checksum" ||
    (request.operation === "pdf" &&
      ["merge", "images"].includes(options.mode ?? "merge")) ||
    (request.operation === "archive" &&
      (options.mode ?? "create") === "create");
  if (!multiple && request.files.length !== 1) {
    throw new Error("This operation needs one file.");
  }
  return { ...request, options };
}
