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
import { GenerateVideoRequest } from "@mpeg-v/types";
import { Authorization } from "@mpeg-v/utils";

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

    const extension = audio.filename.split(".").pop();
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

    await ctx.deferReply(!!ctx.options.private);
    const data: GenerateVideoRequest = {
      url: audio.url,
      logs: {
        user_id: ctx.author.id,
        guild_id: ctx.guildId ?? null,
        date_created: ctx.interaction.createdAt,
        type: "slash",
        audio_format: extension,
        file_name: audio.filename,
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
        embeds: [
          embed({
            message: "An error occurred while generating the video",
            status: "error",
          }),
        ],
      });
    }

    // const data = await res.json();
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
