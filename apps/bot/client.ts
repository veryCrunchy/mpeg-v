import { ParseClient, WorkerAdapter, WorkerClient } from "seyfert";
import { handleError } from "utils/error.ts";
import { handleVoiceGatewayPayload } from "utils/voiceTranslation.ts";
import FileActivityEntry from "./activityEntry.ts";

const client = new WorkerClient({
  handlePayload(_shardId, packet) {
    handleVoiceGatewayPayload(packet);
  },
  commands: {
    prefix: () => {
      return ["mv", ".v"];
    },
    reply: () => true,
    // deferReplyResponse: (ctx) => ({
    //   content: "Please wait, processing your request...",
    // }),
    defaults: {
      onRunError(ctx, error) {
        return handleError(ctx, error)
      }
    }
  },
});

client.setServices({
  cache: {
    adapter: new WorkerAdapter(client.workerData),
  },
});
// This will start the connection with the gateway and load commands, events, components and langs
await client
  .start()
  .then(() => {
    if (Deno.env.get("DISCORD_ACTIVITY_ENABLED") === "true") {
      client.commands.entryPoint = new FileActivityEntry();
    }
    return client.uploadCommands({ cachePath: "./commands.json" });
  });

Deno.env.set("START_TIME", Date.now().toString());

declare module "seyfert" {
  interface UsingClient extends ParseClient<WorkerClient<true>> { }
  interface ExtendedRC {
    production: boolean;
  }

  interface InternalOptions {
    asyncCache: true // because you are using WorkerAdapter
  }
}
