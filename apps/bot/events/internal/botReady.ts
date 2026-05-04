import { createEvent } from "seyfert";
import { resumeVoiceTranslationSessions } from "utils/voiceTranslation.ts";

export default createEvent({
  data: { name: "botReady" },
  run(user, client) {
    client.logger.info(
      `All workers and shards of ${user.username} are ready`,
    );
    setTimeout(() => {
      void resumeVoiceTranslationSessions(client);
    }, 3_000);
  },
});
