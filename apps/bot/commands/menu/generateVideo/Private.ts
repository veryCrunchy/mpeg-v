import {
  Declare,
  MenuCommandContext,
  MessageCommandInteraction,
} from "seyfert";
import { GenerateVideoBase } from "./Base.ts";
import { ApplicationCommandType } from "seyfert/lib/types/index.js";

@Declare({
  name: "Generate Video (Private)",
  integrationTypes: ["GuildInstall", "UserInstall"],
  type: ApplicationCommandType.Message,
})
export default class GenerateVideoPrivate extends GenerateVideoBase {
  protected override privateReply = true;
  override async run(ctx: MenuCommandContext<MessageCommandInteraction>) {
    await ctx.deferReply(true);
    return super.run(ctx);
  }
}
