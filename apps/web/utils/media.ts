import {
  mediaPlan,
  mediaProtocols,
  MEDIA_OUTPUT_LIMIT,
  type MediaOptions,
} from "./mediaPlan";
import { convertImage, outputName } from "./image";
import type { LocalResult } from "./tools";
import { mediaAssetPath } from "./mediaAssets";

export async function convertMedia(
  file: File,
  options: MediaOptions,
  signal: AbortSignal,
  status: (message: string) => void,
): Promise<LocalResult> {
  status(
    "Loading media tools. The first download is about 31 MB; your file stays here.",
  );
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  signal.throwIfAborted();
  const engine = new FFmpeg();
  const abort = () => engine.terminate();
  signal.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    engine.terminate();
  }, 300_000);
  try {
    await engine.load({
      classWorkerURL: new URL(`${mediaAssetPath}worker.js`, location.origin)
        .href,
      coreURL: new URL(`${mediaAssetPath}ffmpeg-core.js`, location.origin).href,
      wasmURL: new URL(`${mediaAssetPath}ffmpeg-core.wasm`, location.origin)
        .href,
    });
    signal.throwIfAborted();
    status("Reading media tracks…");
    const bytes = new Uint8Array(await file.arrayBuffer());
    signal.throwIfAborted();
    await engine.writeFile("input", bytes);
    const probeExit = await engine.ffprobe(
      [
        ...mediaProtocols,
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of",
        "json",
        "input",
        "-o",
        "info.json",
      ],
      15_000,
    );
    // Core 0.12.10 can return -1 after a successful ffprobe (upstream #817).
    // Require valid metadata as well, so the workaround cannot accept a failed probe.
    if (probeExit !== 0 && probeExit !== -1)
      throw new Error(
        "This file could not be read. Try a different file or format.",
      );
    let probe;
    try {
      probe = JSON.parse(
        (await engine.readFile("info.json", "utf8")) as string,
      );
    } catch {
      throw new Error(
        "This file could not be read. Try a different file or format.",
      );
    }
    if (
      !probe ||
      !Array.isArray(probe.streams) ||
      !probe.streams.length ||
      !Number.isFinite(Number(probe.format?.duration)) ||
      Number(probe.format?.duration) <= 0
    )
      throw new Error(
        "This file could not be read. Try a different file or format.",
      );
    const video = probe.streams?.find(
      (stream: { codec_type: string }) => stream.codec_type === "video",
    );
    const plan = mediaPlan(options, {
      duration: Number(probe.format?.duration),
      hasAudio: probe.streams?.some(
        (stream: { codec_type: string }) => stream.codec_type === "audio",
      ),
      hasVideo: Boolean(video),
      width: video?.width,
      height: video?.height,
    });
    status("Converting on your device…");
    const exit = await engine.exec(plan.args, 270_000);
    if (exit !== 0)
      throw new Error(
        "Conversion could not finish. Try a shorter clip or a smaller size.",
      );
    const data = await engine.readFile(`output.${plan.extension}`);
    if (typeof data === "string" || !data.length)
      throw new Error("No output was produced.");
    if (data.length >= MEDIA_OUTPUT_LIMIT - 65536)
      throw new Error(
        "The result is too large. Choose a shorter clip, lower quality or a smaller size.",
      );
    let blob = new Blob([new Uint8Array(data)], { type: plan.type });
    let extension = plan.extension;
    if (options.kind === "video" && options.videoFormat === "jpg") {
      signal.throwIfAborted();
      blob = (
        await convertImage(new File([blob], "frame.png"), "image/jpeg", 0, 90)
      ).blob;
      extension = "jpg";
    }
    return {
      blob,
      name: outputName(file.name, extension),
      detail: ["png", "jpg"].includes(plan.extension)
        ? `Frame at ${options.start} seconds`
        : `${plan.length.toFixed(1)} seconds`,
    };
  } catch (error) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (timedOut)
      throw new Error(
        "This conversion took too long. Try a shorter clip or a smaller size.",
      );
    if (
      error instanceof Error &&
      !/fetch|import|worker|terminated/i.test(error.message)
    )
      throw error;
    throw new Error(
      "Media tools could not start. Reload the page and try again in a browser with WebAssembly support.",
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    engine.terminate();
  }
}
