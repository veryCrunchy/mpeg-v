import { WorkerClient, ParseClient, WorkerAdapter } from "seyfert";

const client = new WorkerClient({});

client.setServices({
  cache: {
    adapter: new WorkerAdapter(client.workerData),
  },
});
// This will start the connection with the gateway and load commands, events, components and langs
await client
  .start()
  .then(() => client.uploadCommands({ cachePath: "./commands.json" }));

Deno.env.set("START_TIME", Date.now().toString());

declare module "seyfert" {
  interface UsingClient extends ParseClient<WorkerClient<true>> {}
}
