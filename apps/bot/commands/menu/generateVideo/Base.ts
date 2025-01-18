import {
  ContextMenuCommand,
  MenuCommandContext,
  MessageCommandInteraction,
} from "seyfert";
import { filterAudioFiles, generateVideo } from "utils/generateVideo.ts";

export class GenerateVideoBase extends ContextMenuCommand {
  async run(ctx: MenuCommandContext<MessageCommandInteraction>) {
    const files = ctx.target.attachments;

    if (files.length === 0) {
      throw new Error(
        "No files were found in this message, please attach a file to generate a video.",
      );
    }

    const filteredFiles = filterAudioFiles(files);
    if (!filteredFiles) return;

    for (const file of filteredFiles) {
      const [attachment, res] = await generateVideo(
        file,
        ctx,
        "menu",
      );

      const conversionTime = res.headers.get("Conversion-Time");
      console.log(ctx.interaction);
      return ctx.editOrReply({
        content: `\`${file.filename}\` ${ctx.target.url}\n-# Completed in ${Number(conversionTime) / 1000
          } seconds`,
        files: [attachment],
      });
    }
  }
}
