import { createEvent } from "seyfert";

export default createEvent({
  data: { name: "botReady" },
  run(user, client) {
    client.logger.info(`All workers and shards of ${user.username} are ready`);
  },
});
