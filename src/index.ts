import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "..", ".env") });

console.log("Starting bot client in " + process.env.NODE_ENV);

import "./client";
