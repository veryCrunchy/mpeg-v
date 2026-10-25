import { Command, type CommandContext, Declare, IgnoreCommand } from "seyfert";
import { toolboxReply } from "utils/activity.ts";

@Declare({
  name: "tools",
  description: "Find file commands and the private browser toolbox",
  integrationTypes: ["GuildInstall", "UserInstall"],
  contexts: ["Guild", "BotDM", "PrivateChannel"],
  ignore: IgnoreCommand.Message,
})
export default class ToolsCommand extends Command {
  override run(ctx: CommandContext) {
    return ctx.write(toolboxReply());
  }
}
