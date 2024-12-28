import { Declare, Command, type CommandContext } from "seyfert";
import { ApplicationCommandType } from "seyfert/lib/types/index.js";
@Declare({
  name: "Generate Video",
  integrationTypes: ["GuildInstall", "UserInstall"],
  type: ApplicationCommandType.Message,
})
export default class GenerateVideo extends Command {
  override async run(ctx: CommandContext) {
    // TODO: figure out how tf to declare a Message CtxMenu Command
  }
}
