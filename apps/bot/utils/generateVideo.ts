import { ConversionLogs, GenerateVideoRequest } from "@mpeg-v/types";
import { Authorization, determineSizeLimit } from "@mpeg-v/utils";
import {
  AttachmentBuilder,
  Message,
  MessageCommandInteraction,
} from "seyfert";
import { ALLOWED_EXTENSIONS } from "utils/general.ts";
import { CommandContext, MenuCommandContext } from "seyfert";

export function filterAudioFiles<T extends { filename: string }>(
  files: T[],
): T[] | null {
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
  const extension = filename.split(".").pop();
  console.log(extension, filename)
  return ALLOWED_EXTENSIONS.includes(extension!);
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
): Promise<[AttachmentBuilder, Response]> {
  const extension = file.filename.split(".").pop()!;
  const guild = await ctx.guild();

  let date_created;
  if (ctx instanceof Message) {
    date_created = ctx.createdAt;
  } else {
    date_created = ctx.interaction.createdAt
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
  };
  const res = await fetch(Deno.env.get("STREAM") + "/generate", {
    headers: {
      "Content-Type": "application/json",
      Authorization,
    },
    method: "POST",
    body: JSON.stringify(data),
  });

  if (res.status == 413) {
    throw new Error(
      "File size is too large",
      {
        cause: `File size exceeds ${guild ? "this guilds" : "discords"
          } upload limit of \`${determineSizeLimit(guild?.premiumTier || 0) / 1024 / 1024
          }MB\``,
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
    throw new Error("Failed to generate video", {
      cause: res.statusText,
    });
  }
}
