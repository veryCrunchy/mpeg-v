import {
  ContextMenuCommand,
  MenuCommandContext,
  MessageCommandInteraction,
} from "seyfert";
import { filterAudioFiles, generateVideo } from "utils/generateVideo.ts";
import { MessageFlags } from "seyfert/lib/types/index.js";

export class GenerateVideoBase extends ContextMenuCommand {
  protected privateReply = false;
  async run(ctx: MenuCommandContext<MessageCommandInteraction>) {
    const files = ctx.target.attachments;

    if (files.length === 0) {
      throw new Error(
        "No files were found in this message, please attach a file to generate a video.",
      );
    }

    const filteredFiles = filterAudioFiles(files);

    for (const file of filteredFiles) {
      const [attachment, res] = await generateVideo(
        file,
        ctx,
        "menu",
      );

      const conversionTime = res.headers.get("Conversion-Time");
      const reply = {
        content: `\`${file.filename}\` ${ctx.target.url}\n-# Completed in ${
          Number(conversionTime) / 1000
        } seconds`,
        files: [attachment],
        allowed_mentions: { parse: [] },
      };
      if (file === filteredFiles[0]) {
        await ctx.editOrReply(reply);
      } else {
        await ctx.interaction.followup({
          ...reply,
          flags: this.privateReply ? MessageFlags.Ephemeral : undefined,
        });
      }
    }
  }
}
