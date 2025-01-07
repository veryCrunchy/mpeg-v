import { WorkerManager } from "seyfert";
const manager = new WorkerManager({
  mode: "threads",
  path: "./client.ts",
  shardsPerWorker: 3,
});
manager.start();
