import { runMedia } from "./converter.ts";
import { HttpError, readLimited } from "./http.ts";
import {
  type MediaOptions,
  mediaPlan,
  mediaProtocols,
} from "../web/utils/core/mediaPlan.ts";
import { outputName } from "../web/utils/core/filenames.ts";
import type { DocumentFile } from "../web/utils/core/documents.ts";
import type {
  FileOperation,
  FileToolOptions,
} from "../mpeg-v/types/fileTools.ts";

export async function convertNative(
  file: DocumentFile,
  operation: FileOperation,
  options: FileToolOptions,
  limit: number,
  signal: AbortSignal,
): Promise<DocumentFile> {
  signal.throwIfAborted();
  const directory = await Deno.makeTempDir({ prefix: "mpeg-v-file-" });
  const input = `${directory}/input`;
  try {
    await Deno.writeFile(input, file.bytes, { signal });
    const protocols = operation === "image"
      ? [
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "png_pipe,jpeg_pipe,webp_pipe,bmp_pipe,gif,mov,avif",
      ]
      : mediaProtocols;
    const probe = JSON.parse(
      new TextDecoder().decode(
        await runMedia(
          "ffprobe",
          [
            "-v",
            "error",
            ...protocols,
            "-i",
            input,
            "-show_entries",
            "format=duration:stream=codec_type,width,height",
            "-of",
            "json",
          ],
          65536,
          signal,
        ),
      ),
    );
    const video = probe.streams?.find((stream: { codec_type: string }) =>
      stream.codec_type === "video"
    );
    let args: string[], extension: string, type: string;
    if (operation === "image") {
      if (
        !video || !Number.isFinite(video.width * video.height) ||
        video.width < 1 || video.height < 1 ||
        video.width * video.height > 24_000_000
      ) throw new HttpError(413, "Choose an image up to 24 million pixels.");
      extension = options.format ?? "webp";
      type = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
      const filters: string[] = [];
      if (options.edge) {
        filters.push(
          `scale=w='min(${options.edge},iw)':h='min(${options.edge},ih)':force_original_aspect_ratio=decrease`,
        );
      }
      if (options.rotation === 90) filters.push("transpose=clock");
      if (options.rotation === 180) filters.push("hflip", "vflip");
      if (options.rotation === 270) filters.push("transpose=cclock");
      if (options.flip === "horizontal") filters.push("hflip");
      if (options.flip === "vertical") filters.push("vflip");
      args = [
        ...protocols,
        "-i",
        input,
        "-map_metadata",
        "-1",
        "-frames:v",
        "1",
        "-an",
      ];
      if (extension === "jpg") {
        const transform = filters.length ? `${filters.join(",")},` : "";
        args.push(
          "-filter_complex",
          `[0:v:0]${transform}format=rgba,split[bg][fg];[bg]format=rgb24,drawbox=color=white:t=fill[white];[white][fg]overlay=shortest=1,format=rgb24[out]`,
          "-map",
          "[out]",
          "-q:v",
          "2",
        );
      } else {
        if (filters.length) args.push("-vf", filters.join(","));
        if (extension === "webp") args.push("-quality", "82");
      }
      args.push("-fs", String(limit + 65536));
    } else {
      let plan;
      try {
        plan = mediaPlan({
          kind: operation === "video"
            ? "video"
            : options.format === "waveform"
            ? "audio"
            : "audio-format",
          audioFormat: (options.format ?? "mp3") as MediaOptions["audioFormat"],
          videoFormat: (options.format ?? "mp4") as MediaOptions["videoFormat"],
          bitrate: options.bitrate ?? 128,
          maxEdge: options.edge ?? 720,
          quality: options.quality ?? 28,
          start: options.start ?? 0,
          duration: options.duration ?? 0,
          mute: options.mute,
          normalize: options.normalize,
          audioVideo: options.audioVideo,
        }, {
          duration: Number(probe.format?.duration),
          hasAudio: probe.streams?.some((stream: { codec_type: string }) =>
            stream.codec_type === "audio"
          ),
          hasVideo: Boolean(video),
          width: video?.width,
          height: video?.height,
        });
      } catch (error) {
        throw new HttpError(422, (error as Error).message);
      }
      extension = plan.extension;
      type = plan.type;
      args = plan.args.slice(0, -1).map((value) =>
        value === "input" ? input : value
      );
      args[args.indexOf("-fs") + 1] = String(limit + 65536);
      if (operation === "video" && options.format === "jpg") {
        extension = "jpg";
        type = "image/jpeg";
        args.push("-q:v", "2");
      }
    }
    const output = `${directory}/output.${extension}`;
    await runMedia(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-threads",
        "2",
        "-filter_threads",
        "1",
        "-filter_complex_threads",
        "1",
        ...args,
        "-threads",
        "2",
        output,
      ],
      1024,
      signal,
    );
    if ((await Deno.stat(output)).size > limit) {
      throw new HttpError(
        413,
        "The result exceeds Discord's attachment limit. Choose a smaller size or a shorter clip.",
      );
    }
    const handle = await Deno.open(output);
    const bytes = await readLimited(handle.readable, limit, signal);
    if (!bytes.length) throw new HttpError(422, "No output was produced.");
    return { name: outputName(file.name, extension), type, bytes };
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}
