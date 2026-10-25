import {
  Command,
  type CommandContext,
  createAttachmentOption,
  createBooleanOption,
  Declare,
  IgnoreCommand,
  Options,
  SubCommand,
} from "seyfert";
import { ALLOWED_EXTENSIONS } from "utils/general.ts";
import { generateVideo, isValidAudioFile } from "utils/generateVideo.ts";
import { audioVideoOptions, audioVideoOverrides } from "utils/preferences.ts";

const options = {
  file: createAttachmentOption({
    description: `The audio file to convert (${ALLOWED_EXTENSIONS.join(", ")})`,
    required: true,
  }),
  private: createBooleanOption({
    description: "If you don't want the message to be visible to others",
    required: false,
  }),
  ...audioVideoOptions,
};
@Declare({
  name: "video",
  description: "Generate a video from an audio file",
  integrationTypes: ["GuildInstall", "UserInstall"],
  ignore: IgnoreCommand.Message,
})
@Options(options)
class Video extends SubCommand {
  override async run(ctx: CommandContext<typeof options>) {
    await ctx.deferReply(!!ctx.options.private);

    const audio = ctx.options.file;

    const filteredFiles = isValidAudioFile(audio.filename);
    if (!filteredFiles) {
      throw new Error(
        `Choose an audio file: ${ALLOWED_EXTENSIONS.join(", ")}.`,
      );
    }

    const [attachment, res] = await generateVideo(
      audio,
      ctx,
      "slash",
      audioVideoOverrides(ctx.options),
    );

    const conversionTime = res.headers.get("Conversion-Time");
    return ctx.editOrReply({
      content: `\`${audio.filename}\`\n-# Completed in ${
        Number(conversionTime) / 1000
      } seconds`,
      files: [attachment],
      allowed_mentions: { parse: [] },
    });
  }
}

@Declare({
  name: "generate",
  description: "Generate ...",
})
@Options([Video])
export default class ParentCommand extends Command {}
