import {
  Declare,
  MenuCommandContext,
  MessageCommandInteraction,
} from "seyfert";
import { GenerateVideoBase } from "./Base.ts";
import { ApplicationCommandType } from "seyfert/lib/types/index.js";
import { handleError } from "utils/error.ts";

@Declare({
  name: "Generate Video (Private)",
  integrationTypes: ["GuildInstall", "UserInstall"],
  type: ApplicationCommandType.Message,
})
export default class GenerateVideoPrivate extends GenerateVideoBase {
  override async run(ctx: MenuCommandContext<MessageCommandInteraction>) {
    await ctx.deferReply(true);
    return super.run(ctx);
  }

  override onRunError(
    ctx: MenuCommandContext<MessageCommandInteraction>,
    error: Error,
  ) {
    return handleError(ctx, error, true);
  }
}

@Declare({
  name: "Generate Video",
  integrationTypes: ["GuildInstall", "UserInstall"],
  type: ApplicationCommandType.Message,
})
export class GenerateVideoPublic extends GenerateVideoBase {}
