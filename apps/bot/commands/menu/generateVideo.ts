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
import { filterFiles, generateVideo } from "utils/videoUtils.ts";

@Declare({
  name: "Generate Video",
  integrationTypes: ["GuildInstall", "UserInstall"],
  type: ApplicationCommandType.Message,
})
export default class GenerateVideo extends ContextMenuCommand {
  override async run(ctx: MenuCommandContext<MessageCommandInteraction>) {
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

    const filteredFiles = filterFiles(files, ctx);
    if (!filteredFiles) return;

    for (const file of filteredFiles) {
      const [attachment, res] = await generateVideo(file, ctx, "menu");
      if (!res.ok) {
        return ctx.editOrReply({
          flags: MessageFlags.Ephemeral,
          embeds: [
            embed({
              message: `An error occurred while generating the video. 
Reason: ${
                res.statusText === "Not Found"
                  ? "Maintenance; Please try again (soon)."
                  : res.statusText
              }`,
              status: "error",
            }),
          ],
        });
      }

      const conversionTime = res.headers.get("Conversion-Time");
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
