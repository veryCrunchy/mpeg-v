import {
  Command,
  type CommandContext,
  createAttachmentOption,
  createBooleanOption,
  createNumberOption,
  createStringOption,
  Declare,
  IgnoreCommand,
  Options,
  type OptionsRecord,
  SubCommand,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types/index.js";
import { audioVideoOptions, audioVideoOverrides } from "utils/preferences.ts";
import {
  type FileCommandInput,
  fileJobs,
  runFileCommand,
} from "utils/fileJobs.ts";
import type {
  FileOperation,
  FileToolOptions,
} from "../../../mpeg-v/types/fileTools.ts";

const file = createAttachmentOption({
  description: "File to process on the bot server",
  required: true,
});
const visibility = createBooleanOption({
  description: "Post the result publicly (default: only you can see it)",
});
const extraFiles = Object.fromEntries(
  [2, 3, 4, 5].map(
    (index) => [
      `file${index}`,
      createAttachmentOption({
        description: `Additional file ${index}, in output order`,
      }),
    ],
  ),
);
const choice = (description: string, values: string[], required = false) =>
  createStringOption({
    description,
    required,
    choices: values.map((value) => ({ name: value, value })),
  });
const number = (description: string, values: number[]) =>
  createNumberOption({
    description,
    choices: values.map((value) => ({ name: String(value), value })),
  });
const start = createNumberOption({
  description: "Start time in seconds",
  min_value: 0,
  max_value: 86400,
});
const duration = createNumberOption({
  description: "Clip length in seconds; 0 keeps the remaining duration",
  min_value: 0,
  max_value: 900,
});
const pages = createStringOption({
  description: "Pages such as 1-3,5; leave empty for all pages",
  max_length: 1000,
});
const rotation = number("Rotate clockwise in degrees", [0, 90, 180, 270]);
function tool(
  name: string,
  description: string,
  options: OptionsRecord,
  operation: FileOperation,
  keys: Record<string, keyof FileToolOptions>,
) {
  @Declare({ name, description, ignore: IgnoreCommand.Message })
  @Options({ file, ...options, public: visibility })
  class FileTool extends SubCommand {
    override run(ctx: CommandContext) {
      const values = ctx.options as unknown as FileCommandInput;
      const settings = Object.fromEntries(
        Object.entries(keys).filter(([key]) => values[key] !== undefined).map((
          [key, target],
        ) => [target, values[key]]),
      ) as FileToolOptions;
      if (operation === "audio" && settings.format === "waveform") {
        settings.audioVideo = audioVideoOverrides(values);
      }
      return runFileCommand(ctx, operation, settings);
    }
  }
  return FileTool;
}
export const fileSubcommands = [
  tool(
    "image",
    "Convert, resize, rotate or flip an image",
    {
      format: choice("Output format", ["png", "jpg", "webp"], true),
      edge: number("Longest edge, without enlarging", [800, 1280, 1920, 2560]),
      rotation,
      flip: choice("Flip after rotating", ["none", "horizontal", "vertical"]),
    },
    "image",
    { format: "format", edge: "edge", rotation: "rotation", flip: "flip" },
  ),
  tool(
    "audio",
    "Convert or extract audio, or create a waveform video",
    {
      format: choice("Output format", [
        "mp3",
        "wav",
        "flac",
        "ogg",
        "m4a",
        "waveform",
      ], true),
      start,
      duration,
      ...audioVideoOptions,
      normalize: createBooleanOption({
        description: "Normalize audio loudness (audio outputs only)",
      }),
    },
    "audio",
    {
      format: "format",
      start: "start",
      duration: "duration",
      bitrate: "bitrate",
      normalize: "normalize",
    },
  ),
  tool(
    "video",
    "Convert, trim, resize, mute or capture a video frame",
    {
      format: choice("Output format; PNG/JPG capture one frame", [
        "mp4",
        "webm",
        "gif",
        "png",
        "jpg",
      ], true),
      start,
      duration,
      edge: number("Longest edge", [480, 720, 1080]),
      quality: number("Video quality: 23 higher, 28 balanced, 33 smaller", [
        23,
        28,
        33,
      ]),
      mute: createBooleanOption({ description: "Remove the audio track" }),
    },
    "video",
    {
      format: "format",
      start: "start",
      duration: "duration",
      edge: "edge",
      quality: "quality",
      mute: "mute",
    },
  ),
  tool(
    "pdf",
    "Merge, split, rotate, select pages or combine images into a PDF",
    {
      action: choice("PDF operation", [
        "merge",
        "extract",
        "split",
        "rotate",
        "images",
      ], true),
      ...extraFiles,
      pages,
      rotation: number("Rotate selected pages clockwise", [90, 180, 270]),
    },
    "pdf",
    { action: "mode", pages: "pages", rotation: "rotation" },
  ),
  tool(
    "archive",
    "Create/list ZIP, extract an entry, or compress/decompress GZIP",
    {
      action: choice("Archive operation", [
        "create",
        "list",
        "extract",
        "gzip",
        "gunzip",
      ], true),
      ...extraFiles,
      entry: createStringOption({
        description: "Exact filename from action:list, for ZIP extraction",
        max_length: 200,
      }),
    },
    "archive",
    { action: "mode", entry: "entry" },
  ),
  tool(
    "text",
    "Convert JSON, CSV, TSV, Base64 or text line formats",
    {
      action: choice("Text operation", [
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
      ], true),
    },
    "text",
    { action: "mode" },
  ),
  tool(
    "checksum",
    "Calculate SHA checksums or compare a file with an expected hash",
    {
      algorithm: choice("Hash algorithm", ["SHA-256", "SHA-384", "SHA-512"]),
      ...extraFiles,
      expected: createStringOption({
        description: "Expected hexadecimal hash; use with one file",
        max_length: 128,
      }),
    },
    "checksum",
    { algorithm: "format", expected: "expected" },
  ),
  tool("info", "Get a file's byte size and SHA-256 checksum", {}, "info", {}),
];
@Declare({
  name: "cancel",
  description: "Cancel your running file job",
  ignore: IgnoreCommand.Message,
})
class CancelFile extends SubCommand {
  override run(ctx: CommandContext) {
    return ctx.write({
      content: fileJobs.cancel(ctx.author.id)
        ? "Cancelling your file job…"
        : "You have no file job running.",
      flags: MessageFlags.Ephemeral,
      allowed_mentions: { parse: [] },
    });
  }
}

@Declare({
  name: "file",
  description: "File tools with private results by default",
  integrationTypes: ["GuildInstall", "UserInstall"],
  contexts: ["Guild", "BotDM", "PrivateChannel"],
  ignore: IgnoreCommand.Message,
})
@Options([...fileSubcommands, CancelFile])
export default class FileCommands extends Command {}
