import { WorkerManager } from "seyfert";
const manager = new WorkerManager({
  mode: "threads",
  // ./src/client.ts for bun and deno (?
  path: "./client.ts",
  
});

manager.start();
