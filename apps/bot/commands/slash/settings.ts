import {
  Command,
  type CommandContext,
  createStringOption,
  Declare,
  IgnoreCommand,
  Options,
  SubCommand,
} from "seyfert";
import {
  audioVideoOptions,
  audioVideoOverrides,
  preferenceRequest,
  settingsOwner,
} from "utils/preferences.ts";
import {
  type PreferenceScope,
  resolveAudioVideo,
} from "../../../web/utils/core/audioVideo.ts";

const scope = createStringOption({
  description: "Personal preferences or this server's defaults (default: me)",
  choices: [{ name: "me", value: "user" }, { name: "server", value: "guild" }],
});
type Input = Record<string, unknown> & {
  scope?: PreferenceScope;
  setting?: string;
};
function summary(values: Record<string, unknown>) {
  return Object.entries(values).map(([key, value]) => `${key}: ${value}`).join(
    "\n",
  ) || "No overrides saved. Inherited defaults apply.";
}
export async function runSettings(
  ctx: CommandContext,
  action: "show" | "save" | "reset",
) {
  await ctx.deferReply(true);
  try {
    const input = ctx.options as Input, target = input.scope ?? "user";
    const id = settingsOwner(ctx, target, action !== "show");
    const current = await preferenceRequest(target, id);
    let record = current;
    if (action === "save") {
      const changes = audioVideoOverrides(input);
      if (!Object.keys(changes).length) {
        throw new Error("Choose at least one setting to save.");
      }
      record = await preferenceRequest(target, id, "PATCH", {
        revision: current.revision,
        changes,
      });
    } else if (action === "reset") {
      record = await preferenceRequest(
        target,
        id,
        input.setting && input.setting !== "all" ? "PATCH" : "DELETE",
        {
          revision: current.revision,
          changes: input.setting && input.setting !== "all"
            ? { [input.setting]: null }
            : undefined,
        },
      );
    }
    const server = ctx.guildId
      ? (target === "guild"
        ? record
        : await preferenceRequest("guild", ctx.guildId))
      : undefined;
    const personal = target === "user"
      ? record
      : await preferenceRequest("user", ctx.author.id);
    const effective = resolveAudioVideo(server?.values, personal.values);
    return await ctx.editOrReply({
      content: `**${
        target === "user" ? "Your" : "Server"
      } audio-to-video defaults${action === "show" ? "" : " updated"}**\n${
        summary(record.values)
      }\n\n**Your next conversion in this context**\n${
        summary(effective as unknown as Record<string, unknown>)
      }\n\nOne-time options override your preferences, which override server defaults. Reset a setting to inherit it.`,
      allowed_mentions: { parse: [] },
    });
  } catch (error) {
    return ctx.editOrReply({
      content:
        error instanceof Error && !/fetch|http|network/i.test(error.message)
          ? error.message
          : "Settings could not be loaded or saved. Try again later.",
      allowed_mentions: { parse: [] },
    });
  }
}
@Declare({
  name: "show",
  description: "View saved and effective audio-to-video settings",
  ignore: IgnoreCommand.Message,
})
@Options({ scope })
class ShowSettings extends SubCommand {
  override run(ctx: CommandContext) {
    return runSettings(ctx, "show");
  }
}
@Declare({
  name: "audio-video",
  description: "Save personal or server audio-to-video defaults",
  ignore: IgnoreCommand.Message,
})
@Options({ scope, ...audioVideoOptions })
class SaveSettings extends SubCommand {
  override run(ctx: CommandContext) {
    return runSettings(ctx, "save");
  }
}
@Declare({
  name: "reset",
  description: "Remove saved overrides and inherit defaults",
  ignore: IgnoreCommand.Message,
})
@Options({
  scope,
  setting: createStringOption({
    description: "Setting to reset (default: all)",
    choices: ["all", ...Object.keys(audioVideoOptions)].map((value) => ({
      name: value,
      value,
    })),
  }),
})
class ResetSettings extends SubCommand {
  override run(ctx: CommandContext) {
    return runSettings(ctx, "reset");
  }
}

@Declare({
  name: "settings",
  description: "Personal and server file-tool preferences",
  integrationTypes: ["GuildInstall", "UserInstall"],
  contexts: ["Guild", "BotDM", "PrivateChannel"],
  ignore: IgnoreCommand.Message,
})
@Options([ShowSettings, SaveSettings, ResetSettings])
export default class Settings extends Command {}
