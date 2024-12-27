import { createEvent } from "seyfert";
import { createItem } from "../../utils/cms.ts";

export default createEvent({
  data: { name: "guildCreate" },
  run(guild) {
    createItem("science_installs", {
      guild_id: guild.id,
      user_id: guild.ownerId,
      is_user: false,
      is_install: true,
    });
  },
});
