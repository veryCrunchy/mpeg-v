import { Declare, EntryPointCommand, type EntryPointContext } from "seyfert";
import {
  ApplicationCommandType,
  EntryPointCommandHandlerType,
} from "seyfert/lib/types/index.js";
import { launchWorkspace } from "utils/activity.ts";

@Declare({
  name: "launch",
  description: "Open the MPEG-V file workspace",
  type: ApplicationCommandType.PrimaryEntryPoint,
  handler: EntryPointCommandHandlerType.AppHandler,
  integrationTypes: ["GuildInstall", "UserInstall"],
  contexts: ["Guild", "BotDM", "PrivateChannel"],
})
export default class FileActivityEntry extends EntryPointCommand {
  override run(ctx: EntryPointContext) {
    return launchWorkspace(ctx);
  }
}
