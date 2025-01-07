import { Command, type CommandContext, Declare } from "seyfert";
import { MessageFlags } from "seyfert/lib/types/index.js";

const lst_time = null;

@Declare({
  name: "latency",
  description: "Test latency",
})
export default class PingCommand extends Command {
  override async run(ctx: CommandContext) {
    const message1 = await ctx.client.messages.write(
      ctx.channelId,
      {
        content: Deno.env.get("HOSTNAME") + " | msg1",
      },
    );
    const message2 = await ctx.client.messages.write(
      ctx.channelId,
      {
        content: Deno.env.get("HOSTNAME") + " | msg2",
      },
    );
    ctx.client.messages.write(
      ctx.channelId,
      {
        content: `${Deno.env.get("HOSTNAME")} | ${
          message2.createdTimestamp - message1.createdTimestamp
        }`,
      },
    );
    // Average latency between existing connections
    await ctx.write({
      content: Deno.env.get("HOSTNAME"),
      flags: MessageFlags.Ephemeral,
    });
  }
}
