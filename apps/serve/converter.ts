import { HttpError, readLimited } from "./http.ts";
import {
  type AudioVideoSettings,
  resolveAudioVideo,
  visualizationFilter,
} from "../web/utils/core/audioVideo.ts";

export const MAX_INPUT_BYTES = 100 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 15 * 60;
const TIMEOUT_MS = 120_000;
let active = 0;

/** Bound downloads and encoders together; never leave an unbounded waiting queue. */
export async function withConversionSlot<T>(
  work: () => Promise<T>,
): Promise<T> {
  if (active >= 2) {
    throw new HttpError(429, "All converters are busy. Try again shortly.");
  }
  active++;
  try {
    return await work();
  } finally {
    active--;
  }
}

export async function runMedia(
  executable: string,
  args: string[],
  maxBytes: number,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const child = new Deno.Command(executable, {
    args,
    stdin: "null",
    stdout: "piped",
    stderr: "null",
  }).spawn();
  const kill = () => {
    try {
      child.kill("SIGKILL");
    } catch { /* Already exited. */ }
  };
  signal.addEventListener("abort", kill, { once: true });
  try {
    // Count each byte once. Exceeding the limit terminates the encoder immediately.
    const bytes = await readLimited(child.stdout, maxBytes);
    const status = await child.status;
    signal.throwIfAborted();
    if (!status.success) {
      throw new HttpError(
        422,
        "This file could not be processed with those settings.",
      );
    }
    return bytes;
  } finally {
    signal.removeEventListener("abort", kill);
    kill();
    await child.status;
  }
}

/** A local seekable input also supports M4A files with metadata at the end. */
export async function convertAudio(
  input: ReadableStream<Uint8Array>,
  maxOutputBytes: number,
  requestSignal: AbortSignal,
  preferences: Partial<AudioVideoSettings> = {},
) {
  const settings = resolveAudioVideo(preferences);
  const signal = AbortSignal.any([
    requestSignal,
    AbortSignal.timeout(TIMEOUT_MS),
  ]);
  const started = performance.now();
  const directory = await Deno.makeTempDir({ prefix: "mpeg-v-" });
  const path = `${directory}/input`;
  let inputSize = 0;
  try {
    const file = await Deno.open(path, { write: true, createNew: true });
    await input.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          inputSize += chunk.length;
          if (inputSize > MAX_INPUT_BYTES) {
            throw new HttpError(413, "Input exceeds 100 MiB.");
          }
          controller.enqueue(chunk);
        },
      }),
    ).pipeTo(file.writable, { signal });
    if (!inputSize) throw new HttpError(400, "The file is empty.");
    // Disable remote protocols even when a container refers to another resource.
    const inputArgs = [
      "-protocol_whitelist",
      "file,pipe",
      "-format_whitelist",
      "mp3,wav,flac,ogg,mov,aac",
      "-i",
      path,
    ];
    const probe = await runMedia(
      "ffprobe",
      [
        "-v",
        "error",
        ...inputArgs,
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_type:format=duration",
        "-of",
        "json",
      ],
      64 * 1024,
      signal,
    );
    const metadata = JSON.parse(new TextDecoder().decode(probe));
    const duration = Number(metadata.format?.duration);
    if (
      !metadata.streams?.length || !Number.isFinite(duration) || duration <= 0
    ) {
      throw new HttpError(422, "This file does not contain readable audio.");
    }
    if (duration > MAX_DURATION_SECONDS) {
      throw new HttpError(413, "Audio must be 15 minutes or shorter.");
    }
    const bytes = await runMedia(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-threads",
        "2",
        ...inputArgs,
        "-filter_complex_threads",
        "1",
        "-filter_complex",
        visualizationFilter(settings),
        "-r",
        String(settings.fps),
        "-map",
        "[v]",
        "-map",
        "0:a:0",
        "-map_metadata",
        "-1",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        `${settings.bitrate}k`,
        "-ac",
        "2",
        "-ar",
        "48000",
        "-t",
        String(MAX_DURATION_SECONDS),
        "-shortest",
        "-movflags",
        "frag_keyframe+empty_moov",
        "-f",
        "mp4",
        "pipe:1",
      ],
      maxOutputBytes,
      signal,
    );
    return {
      bytes,
      inputSize,
      duration,
      milliseconds: Math.round(performance.now() - started),
    };
  } catch (error) {
    if (signal.aborted) {
      throw new HttpError(
        signal.reason?.name === "TimeoutError" ? 504 : 499,
        "Conversion was cancelled or timed out.",
      );
    }
    throw error;
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}
