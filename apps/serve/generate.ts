import { createItem, determineSizeLimit } from "@mpeg-v/utils";
import { ServeItem } from "@mpeg-v/types";
import {
  convertAudio,
  MAX_INPUT_BYTES,
  withConversionSlot,
} from "./converter.ts";
import { errorResponse, HttpError, readJson } from "./http.ts";
import { preferencesStore } from "./preferencesStore.ts";
import {
  type AudioVideoSettings,
  resolveAudioVideo,
  validateAudioVideoPatch,
  validDiscordId,
} from "../web/utils/core/audioVideo.ts";

export function validateAttachmentUrl(value: unknown): URL {
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw new HttpError(400, "Invalid attachment URL.");
  }
  if (
    url.protocol !== "https:" || url.username || url.password || url.port ||
    !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) ||
    !/^\/attachments\/\d+\/\d+\/[^/]+$/.test(url.pathname)
  ) {
    throw new HttpError(400, "Use a Discord attachment URL.");
  }
  return url;
}

export default async function generate(req: Request): Promise<Response> {
  try {
    return await withConversionSlot(async () => {
      const json = await readJson(req);
      if (!json || typeof json !== "object") {
        throw new HttpError(400, "Invalid request.");
      }
      const url = validateAttachmentUrl(json.url);
      let settings: AudioVideoSettings;
      try {
        const overrides = validateAudioVideoPatch(
          json.audioVideo ?? {},
          false,
        ) as Partial<AudioVideoSettings>;
        if (
          json.actor !== undefined &&
          (!validDiscordId(json.actor?.userId) ||
            json.actor?.guildId !== undefined &&
              !validDiscordId(json.actor.guildId))
        ) throw new Error("Invalid settings owner.");
        settings = json.actor
          ? preferencesStore().resolve(
            json.actor.userId,
            json.actor.guildId,
            overrides,
          )
          : resolveAudioVideo(overrides);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, "Invalid audio-to-video settings.");
      }
      if (
        !Number.isInteger(json.tier_limit) || json.tier_limit < 0 ||
        json.tier_limit > 3
      ) {
        throw new HttpError(400, "Invalid upload tier.");
      }
      if (
        json.max_output_bytes !== undefined &&
        (!Number.isInteger(json.max_output_bytes) ||
          json.max_output_bytes < 1 ||
          json.max_output_bytes > 100 * 1024 * 1024)
      ) {
        throw new HttpError(400, "Invalid output limit.");
      }
      const controller = new AbortController();
      const signal = AbortSignal.any([
        req.signal,
        controller.signal,
        AbortSignal.timeout(120_000),
      ]);
      try {
        const file = await fetch(url, { signal, redirect: "error" });
        if (!file.ok || !file.body) {
          throw new HttpError(422, "The attachment could not be downloaded.");
        }
        if (Number(file.headers.get("content-length")) > MAX_INPUT_BYTES) {
          await file.body.cancel();
          throw new HttpError(413, "Input exceeds 100 MiB.");
        }
        const result = await convertAudio(
          file.body,
          json.max_output_bytes ?? determineSizeLimit(json.tier_limit),
          signal,
          settings,
        );
        if (
          Deno.env.get("ENV") === "production" && json.logs &&
          typeof json.logs === "object"
        ) {
          void createItem(ServeItem.ConversionLogs, {
            ...json.logs,
            conversion_time: result.milliseconds,
            input_size: result.inputSize,
            output_size: result.bytes.length,
            file_duration: result.duration,
            input_bitrate: 0,
            output_bitrate: settings.bitrate * 1000,
            cached: false,
          });
        }
        return videoResponse(result);
      } finally {
        controller.abort();
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** The authenticated web gateway uses the same bounded converter as the bot. */
export async function generateUpload(req: Request): Promise<Response> {
  try {
    return await withConversionSlot(async () => {
      if (!req.body) throw new HttpError(400, "Choose an audio file.");
      return videoResponse(
        await convertAudio(req.body, determineSizeLimit(0), req.signal),
      );
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function videoResponse(result: Awaited<ReturnType<typeof convertAudio>>) {
  return new Response(result.bytes, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(result.bytes.length),
      "Conversion-Time": String(result.milliseconds),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
