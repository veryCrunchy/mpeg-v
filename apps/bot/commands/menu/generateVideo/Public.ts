import {
  Declare,
  MenuCommandContext,
  MessageCommandInteraction,
} from "seyfert";
import { GenerateVideoBase } from "./Base.ts";
import { ApplicationCommandType } from "seyfert/lib/types/index.js";

@Declare({
  name: "Generate Video",
  integrationTypes: ["GuildInstall", "UserInstall"],
  type: ApplicationCommandType.Message,
})
export default class GenerateVideoPublic extends GenerateVideoBase {
  override async run(ctx: MenuCommandContext<MessageCommandInteraction>) {
    await ctx.deferReply();
    return super.run(ctx);
  }
}
