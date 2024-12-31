import {
  AttachmentBuilder,
  ContextMenuCommand,
  Declare,
  MenuCommandContext,
  MessageCommandInteraction,
} from "seyfert";
import { embed } from "utils/embed.ts";
import {
  ApplicationCommandType,
  MessageFlags,
} from "seyfert/lib/types/index.js";
import { ALLOWED_EXTENSIONS } from "utils/general.ts";
import { GenerateVideoRequest } from "@mpeg-v/types";
import { Authorization } from "@mpeg-v/utils";

@Declare({
  name: "Generate Video",
  integrationTypes: ["GuildInstall", "UserInstall"],
  type: ApplicationCommandType.Message,
})
export default class GenerateVideo extends ContextMenuCommand {
  override async run(ctx: MenuCommandContext<MessageCommandInteraction<true>>) {
    const files = ctx.target.attachments;
    await ctx.deferReply();

    if (files.length === 0)
      return ctx.editOrReply({
        embeds: [
          embed({
            message:
              "No files were found in this message, please attach a file to generate a video.",
            status: "error",
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });

    const filteredFiles = files.filter((file) => {
      const extension = file.filename.split(".").pop();
      return extension && ALLOWED_EXTENSIONS.includes;
    });

    if (filteredFiles.length === 0)
      return ctx.editOrReply({
        embeds: [
          embed({
            message:
              "Unsupported file type, must be one of the following types:\n`" +
              ALLOWED_EXTENSIONS.join(", ") +
              "`",
            status: "error",
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });

    for (const file of filteredFiles) {
      const extension = file.filename.split(".").pop();
      if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
        return ctx.editOrReply({
          embeds: [
            embed({
              message:
                "Unsupported file type, must be one of the following types:\n`" +
                ALLOWED_EXTENSIONS.join(", ") +
                "`",
              status: "error",
            }),
          ],
        });
      }

      const data: GenerateVideoRequest = {
        url: file.url,
        logs: {
          user_id: ctx.author.id,
          guild_id: ctx.guildId ?? null,
          date_created: ctx.interaction.createdAt,
          type: "menu",
          audio_format: extension,
          file_name: file.filename,
        },
      };
      const res = await fetch(Deno.env.get("STREAM") + "/generate", {
        headers: {
          "Content-Type": "application/json",
          Authorization,
        },
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        return ctx.editOrReply({
          flags: MessageFlags.Ephemeral,
          embeds: [
            embed({
              message: `An error occurred while generating the video. ${res.statusText}`,
              status: "error",
            }),
          ],
        });
      }
      const conversionTime = res.headers.get("Conversion-Time");
      const attachment = new AttachmentBuilder({
        type: "buffer",
        resolvable: res.body,
        filename: file.id + ".mp4",
      });

      return ctx.editOrReply({
        content: `-# Completed in ${Number(conversionTime) / 1000} seconds`,
        embeds: [
          embed({
            message: "Video generated successfully",
            status: "success",
          }),
        ],
        files: [attachment],
      });
    }
  }
}
