import { createEvent } from "seyfert";
import { createItem } from "@mpeg-v/utils";
import { BotItem } from "@mpeg-v/types";
export default createEvent({
  data: { name: "guildDelete" },
  run(guild, client) {
    // it's possible that the guild has been deleted.
    if (guild.unavailable) return;
    createItem(BotItem.ScienceInstalls, {
      guild_id: guild.id,
      user_id: client.cache.guilds?.get(guild.id)?.ownerId,
      is_user: false,
      is_install: false,
    });
  },
});
