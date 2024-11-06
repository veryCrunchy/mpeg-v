import { Event, EventExec, EventKeys } from "../types";
import keys from "../keys";
import { APIEmbed, Client, TextChannel } from "discord.js";

export function event<T extends EventKeys>(
  id: T,
  exec: EventExec<T>
): Event<T> {
  return {
    id,
    exec,
  };
}

export function registerEvents(client: Client, events: Event<any>[]): void {
  for (const event of events)
    client.on(event.id, async (...args) => {
      // Create Props
      const props = {
        client,
        log: (...args: unknown[]) => {
          console.log(`[${event.id}]`, ...args);
          client.shard?.broadcastEval((c, ctx) =>
            (c.channels.cache.get(ctx.channel) as TextChannel).send(
              `[${ctx.eventID}] ${ctx.args.join(", ")}`
            ), {
            context: { channel: keys.logChannel, eventID: event.id, args }
          }
          );
        },
        embedLog: (...args: APIEmbed[]) => {
          client.shard?.broadcastEval((c, ctx) =>
            (c.channels.cache.get(ctx.channel) as TextChannel)?.send(
              { embeds: args }
            ), {
            context: { channel: keys.logChannel, args }
          }
          );
        },
      };

      // Catch uncaught errors
      try {
        await event.exec(props, ...args);
      } catch (error) {
        props.log("Uncaught Error", error);
      }
    });
}
