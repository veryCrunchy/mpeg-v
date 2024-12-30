import { createEvent } from "seyfert";
import { createItem } from "@mpeg-v/utils";
import { BotItem } from "@mpeg-v/types";

export default createEvent({
  data: { name: "guildCreate" },
  run(guild) {
    createItem(BotItem.ScienceInstalls, {
      guild_id: guild.id,
      user_id: guild.ownerId,
      is_user: false,
      is_install: true,
    });
  },
});
