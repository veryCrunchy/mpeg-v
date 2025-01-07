import { Command, type CommandContext, Declare } from "seyfert";
import { MessageFlags } from "seyfert/lib/types/index.js";

@Declare({
  name: "ping",
  description: "Show latency with Discord",
})
export default class PingCommand extends Command {
  override async run(ctx: CommandContext) {
    // Average latency between existing connections
    const ping = ctx.client.latency;
    await ctx.write({
      content: `The latency is \`${ping}\`ms | ${Deno.env.get("HOSTNAME")}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
