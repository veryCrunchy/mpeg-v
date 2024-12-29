import {
  AttachmentBuilder,
  ContextMenuCommand,
  Declare,
  MenuCommandContext,
  MessageCommandInteraction,
} from "seyfert";
import { embed } from "../../utils/embed.ts";
import {
  ApplicationCommandType,
  MessageFlags,
} from "seyfert/lib/types/index.js";
import { ALLOWED_EXTENSIONS } from "utils/general.ts";

@Declare({
  name: "Generate Video",
  integrationTypes: ["GuildInstall", "UserInstall"],
  type: ApplicationCommandType.Message,
})
export default class GenerateVideo extends ContextMenuCommand {
  override async run(ctx: MenuCommandContext<MessageCommandInteraction<true>>) {
    const files = ctx.target.attachments;

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
      const res = await fetch(Deno.env.get("STREAM") + "/generate", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("API_TOKEN")}`,
        },
        method: "POST",
        body: JSON.stringify({ url: file.url }),
      });

      if (!res.ok) {
        return ctx.editOrReply({
          embeds: [
            embed({
              message: "An error occurred while generating the video",
              status: "error",
            }),
          ],
        });
      }

      const data = await res.json();
      const attachment = new AttachmentBuilder({
        type: "url",
        resolvable: data.url,
        filename: file.id + ".mp4",
        description: "dargy was here", // TODO: change later
      });

      return ctx.editOrReply({
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