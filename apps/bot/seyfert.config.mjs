// @ts-check is better
import { config } from "seyfert";
export default config.bot({
  token: Deno.env.get("CLIENT_TOKEN") ?? "",
  intents: ["Guilds"],
  debug: Deno.env.get("ENVIRONMENT") !== "prod",
  locations: {
    base: "",
    output: "",
    // commands: "commands",
    events: "events",
  },
});
