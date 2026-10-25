import { ConversionLogs, GenerateVideoRequest } from "@mpeg-v/types";
import { Authorization, determineSizeLimit } from "@mpeg-v/utils";
import { AttachmentBuilder, Message, MessageCommandInteraction } from "seyfert";
import { ALLOWED_EXTENSIONS } from "utils/general.ts";
import { CommandContext, MenuCommandContext } from "seyfert";
import type { AudioVideoSettings } from "../../web/utils/core/audioVideo.ts";

export function filterAudioFiles<T extends { filename: string }>(
  files: T[],
): T[] {
  const filteredFiles = files.filter((file) => {
    return isValidAudioFile(file.filename);
  });

  if (filteredFiles.length === 0) {
    throw new Error(
      "Unsupported file type, must be one of the following types:\n`" +
        ALLOWED_EXTENSIONS.join(", ") +
        "`",
    );
  }

  return filteredFiles;
}

export function isValidAudioFile(filename: string): boolean {
  const extension = filename.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(extension ?? "");
}

export function formatFileSize(size: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (size >= 1024) {
    size /= 1024;
    i++;
  }
  return size.toFixed(2) + " " + units[i];
}

export async function generateVideo(
  file: { filename: string; url: string; id: string },
  ctx: CommandContext | MenuCommandContext<MessageCommandInteraction> | Message,
  type: ConversionLogs["type"],
  audioVideo?: Partial<AudioVideoSettings>,
): Promise<[AttachmentBuilder, Response]> {
  const extension = file.filename.split(".").pop()!.toLowerCase();
  const guild = ctx.guildId ? await ctx.guild() : undefined;
  const discordLimit = ctx instanceof Message
    ? undefined
    : ctx.interaction?.attachmentSizeLimit;
  const outputLimit = Number.isInteger(discordLimit) && discordLimit! > 0
    ? Math.min(discordLimit!, 100 * 1024 * 1024)
    : determineSizeLimit(guild?.premiumTier || 0);

  let date_created;
  if (ctx instanceof Message) {
    date_created = ctx.createdAt;
  } else {
    date_created = ctx.interaction.createdAt;
  }

  const data: GenerateVideoRequest = {
    url: file.url,
    logs: {
      user_id: ctx.author.id,
      guild_id: ctx.guildId ?? "DM",
      date_created,
      type,
      audio_format: extension,
      file_name: file.filename,
    },
    tier_limit: guild?.premiumTier || 0,
    max_output_bytes: outputLimit,
    actor: { userId: ctx.author.id, guildId: ctx.guildId },
    audioVideo,
  };
  const res = await fetch(Deno.env.get("STREAM") + "/generate", {
    signal: AbortSignal.timeout(130_000),
    headers: {
      "Content-Type": "application/json",
      Authorization,
    },
    method: "POST",
    body: JSON.stringify(data),
  });

  if (res.status === 429) {
    await res.body?.cancel();
    throw new Error("All converters are busy. Please try again shortly.");
  }

  if (res.status == 413) {
    await res.body?.cancel();
    throw new Error(
      "Audio is too long or the converted video is too large",
      {
        cause: `Audio must be at most 15 minutes and the output must fit ${
          guild ? "this guilds" : "discords"
        } upload limit of \`${outputLimit / 1024 / 1024}MB\``,
      }, //TODO: Promote Pro Plan
    );
  }

  if (res.ok && res.body) {
    const attachment = new AttachmentBuilder({
      type: "buffer",
      resolvable: res.body,
      filename: file.id + ".mp4",
    });

    return [attachment, res];
  } else {
    await res.body?.cancel();
    throw new Error("Failed to generate video", {
      cause: res.statusText,
    });
  }
}
