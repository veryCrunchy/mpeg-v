import {
  type AudioVideoSettings,
  resolveAudioVideo,
  visualizationFilter,
} from "./audioVideo.ts";
export type AudioFormat = "mp3" | "wav" | "flac" | "ogg" | "m4a";
export type VideoFormat = "mp4" | "webm" | "gif" | "png" | "jpg";
export interface MediaOptions {
  kind: "audio" | "audio-format" | "video";
  audioFormat: AudioFormat;
  videoFormat: VideoFormat;
  bitrate: number;
  maxEdge: number;
  quality: number;
  start: number;
  duration: number;
  mute?: boolean;
  normalize?: boolean;
  audioVideo?: Partial<AudioVideoSettings>;
}
export interface MediaInfo {
  duration: number;
  hasAudio: boolean;
  hasVideo: boolean;
  width?: number;
  height?: number;
}
export const MEDIA_OUTPUT_LIMIT = 100 * 1024 * 1024;
export const mediaProtocols = [
  "-protocol_whitelist",
  "file,pipe",
  "-format_whitelist",
  "mp3,wav,flac,ogg,mov,aac,matroska,webm,avi,gif",
];
export function mediaPlan(options: MediaOptions, info: MediaInfo) {
  const { kind, start, duration, bitrate, maxEdge, quality } = options;
  if (
    ![start, duration, bitrate, maxEdge, quality].every(Number.isFinite) ||
    start < 0 ||
    duration < 0 ||
    start >= info.duration ||
    !Number.isFinite(info.duration) ||
    info.duration <= 0
  ) {
    throw new Error(
      "Choose a start time and length within the file's duration.",
    );
  }
  if (
    ![64, 128, 192, 256].includes(bitrate) ||
    ![480, 720, 1080].includes(maxEdge) ||
    ![23, 28, 33].includes(quality)
  ) {
    throw new Error("Choose valid media settings.");
  }
  const frame = kind === "video" &&
    ["png", "jpg"].includes(options.videoFormat);
  const length = frame
    ? Math.min(1, info.duration - start)
    : duration
    ? Math.min(duration, info.duration - start)
    : info.duration - start;
  const limit = kind === "video"
    ? (options.videoFormat === "gif" ? 20 : 180)
    : 900;
  if (length > limit) {
    throw new Error(
      `Choose a clip no longer than ${limit} seconds using Start and Length.`,
    );
  }
  if (kind === "video" ? !info.hasVideo : !info.hasAudio) {
    throw new Error(
      kind === "video"
        ? "This file has no video track."
        : "This file has no audio track.",
    );
  }
  if (info.width && info.height && info.width * info.height > 8_294_400) {
    throw new Error("Choose a video no larger than 4K.");
  }
  const args = [
    ...mediaProtocols,
    "-ss",
    String(start),
    "-i",
    "input",
    "-t",
    String(length),
    "-map_metadata",
    "-1",
    "-sn",
    "-dn",
  ];
  let extension: string, type: string;
  if (kind === "audio") {
    const visual = resolveAudioVideo({
      bitrate: bitrate as AudioVideoSettings["bitrate"],
    }, options.audioVideo);
    extension = "mp4";
    type = "video/mp4";
    args.push(
      "-filter_complex",
      visualizationFilter(visual),
      "-r",
      String(visual.fps),
      "-map",
      "[v]",
      "-map",
      "0:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      `${visual.bitrate}k`,
      "-ac",
      "2",
      "-movflags",
      "+faststart",
    );
  } else if (kind === "audio-format") {
    const formats: Record<AudioFormat, [string, string, string[]]> = {
      mp3: ["mp3", "audio/mpeg", ["-c:a", "libmp3lame", "-b:a", `${bitrate}k`]],
      wav: ["wav", "audio/wav", ["-c:a", "pcm_s16le"]],
      flac: ["flac", "audio/flac", ["-c:a", "flac"]],
      ogg: ["ogg", "audio/ogg", ["-c:a", "libvorbis", "-b:a", `${bitrate}k`]],
      m4a: [
        "m4a",
        "audio/mp4",
        ["-c:a", "aac", "-b:a", `${bitrate}k`, "-movflags", "+faststart"],
      ],
    };
    const selected = formats[options.audioFormat];
    if (!selected) throw new Error("Choose a supported audio format.");
    [extension, type] = selected;
    args.push(
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "2",
      "-ar",
      "44100",
      ...selected[2],
    );
    if (options.normalize) args.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
  } else {
    const edge = options.videoFormat === "gif" ? 480 : maxEdge;
    const scale =
      `scale=w='min(${edge},iw)':h='min(${edge},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;
    extension = options.videoFormat;
    if (extension === "png" || extension === "jpg") {
      // Capture losslessly, then use the browser image encoder for JPEG.
      extension = "png";
      type = "image/png";
      args.push("-map", "0:v:0", "-vf", scale, "-frames:v", "1", "-an");
    } else if (extension === "gif") {
      type = "image/gif";
      args.push(
        "-filter_complex",
        `[0:v:0]${scale},fps=10,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer[v]`,
        "-map",
        "[v]",
        "-an",
        "-loop",
        "0",
      );
    } else if (extension === "mp4" || extension === "webm") {
      type = extension === "mp4" ? "video/mp4" : "video/webm";
      args.push("-map", "0:v:0", "-map", "0:a:0?", "-vf", scale, "-r", "30");
      if (options.mute) args.push("-an");
      if (extension === "mp4") {
        args.push(
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          String(quality),
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          `${bitrate}k`,
          "-movflags",
          "+faststart",
        );
      } else {
        args.push(
          "-c:v",
          "libvpx",
          "-deadline",
          "realtime",
          "-cpu-used",
          "8",
          "-crf",
          String(quality),
          "-b:v",
          "1M",
          "-c:a",
          "libvorbis",
          "-b:a",
          `${bitrate}k`,
        );
      }
    } else throw new Error("Choose a supported video format.");
  }
  // Reject any result approaching this ceiling, rather than returning a clipped file.
  args.push("-fs", String(MEDIA_OUTPUT_LIMIT + 1), `output.${extension}`);
  return { args, extension, type, length };
}
