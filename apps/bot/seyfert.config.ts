// @ts-check is better
import { config } from "seyfert";
const production = ["prod", "production"].includes(
  Deno.env.get("ENVIRONMENT")!,
);
export default config.bot({
  token: Deno.env.get("CLIENT_TOKEN") ?? "",
  intents: ["Guilds", "MessageContent", "GuildMessages"],
  debug: !production,
  production,
  locations: {
    base: "",
    commands: "commands",
    events: "events",
  },
});
