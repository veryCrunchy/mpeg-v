import { Client, GatewayIntentBits, Options } from "discord.js";
import { AutoPoster } from "topgg-autoposter";
import { registerEvents } from "../utils";
import events from "../events";
import keys from "../keys";

const client: Client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  sweepers: {
    messages: {
      interval: 3600, // Every hour...
      lifetime: 1800, // Remove messages older than 30 minutes.
    },
    users: {
      interval: 3600, // Every hour...
      filter: () => (user) => user.bot && user.id !== client.user?.id, // Remove all bots.
    },
  },
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    ReactionManager: 0,
    GuildMemberManager: {
      maxSize: 200,
      keepOverLimit: (member) => member.id === client.user?.id,
    },
  }),
});
registerEvents(client, events);
client.login(keys.clientToken).catch((err) => {
  console.error("[Login Error]", err);
  process.exit(1);
});

if (keys.NODE_ENV === "production") {
  const ap = AutoPoster(keys.topggToken, client);

  ap.on("posted", (stats) => {
    console.log("Posted stats to Top.gg!", stats);
  });
}
