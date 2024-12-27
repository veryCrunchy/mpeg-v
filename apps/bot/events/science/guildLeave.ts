import { createEvent } from "seyfert";
import { createItem } from "../../utils/cms.ts";

export default createEvent({
  data: { name: "guildDelete" },
  run(guild, client) {
    // it's possible that the guild has been deleted.
    if (guild.unavailable) return;
    createItem("science_installs", {
      guild_id: guild.id,
      user_id: client.cache.guilds?.get(guild.id)?.ownerId,
      is_user: false,
      is_install: false,
    });
  },
});
