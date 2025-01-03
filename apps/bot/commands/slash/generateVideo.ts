import {
  AttachmentBuilder,
  Command,
  type CommandContext,
  createAttachmentOption,
  createBooleanOption,
  Declare,
  Options,
  SubCommand,
} from "seyfert";
import { embed } from "utils/embed.ts";
import { ALLOWED_EXTENSIONS } from "utils/general.ts";
import { filterFiles, generateVideo } from "utils/videoUtils.ts";

const options = {
  file: createAttachmentOption({
    description: `The audio file to convert [${ALLOWED_EXTENSIONS.join(", ")}]`,
    required: true,
  }),
  private: createBooleanOption({
    description: "If you don't want the message to be visible to others",
    required: false,
  }),
};
@Declare({
  name: "video",
  description: "Generate a video from an audio file",
  integrationTypes: ["GuildInstall", "UserInstall"],
})
@Options(options)
// @Group("generate")
class Video extends SubCommand {
  override async run(ctx: CommandContext<typeof options>) {
    const audio = ctx.options.file;

    const filteredFiles = filterFiles([audio], ctx);
    if (!filteredFiles) return;

    await ctx.deferReply(!!ctx.options.private);
    const [_, res] = await generateVideo(audio, ctx, "slash");

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

    const attachment = new AttachmentBuilder({
      type: "url",
      resolvable: "", //TODO:
      filename: audio.id + ".mp4",
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

@Declare({
  name: "generate",
  description: "Generate ...",
})
@Options([Video])
export default class ParentCommand extends Command {}
