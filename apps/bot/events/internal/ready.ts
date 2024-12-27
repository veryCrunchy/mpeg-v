import { createEvent } from "seyfert";

export default createEvent({
  data: { once: true, name: "botReady" },
  run(user, client) {
    client.logger.info(`All shards of ${user.username} are ready`);
  },
});
