import { Command, type CommandContext, Declare, IgnoreCommand } from "seyfert";
import { launchWorkspace } from "utils/activity.ts";

@Declare({
  name: "activity",
  description: "Open the file workspace inside Discord",
  integrationTypes: ["GuildInstall", "UserInstall"],
  contexts: ["Guild", "BotDM", "PrivateChannel"],
  ignore: IgnoreCommand.Message,
})
export default class ActivityCommand extends Command {
  override run(ctx: CommandContext) {
    return launchWorkspace(ctx);
  }
}
