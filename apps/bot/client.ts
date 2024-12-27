import { WorkerClient, ParseClient, WorkerAdapter } from "seyfert";

const client = new WorkerClient();

client.setServices({
  cache: {
    adapter: new WorkerAdapter(client.workerData),
  },
});
// This will start the connection with the gateway and load commands, events, components and langs
await client.start();
declare module "seyfert" {
  interface UsingClient extends ParseClient<WorkerClient<true>> {}
}
