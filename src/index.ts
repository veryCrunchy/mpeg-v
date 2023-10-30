import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "..", ".env") });

import keys from "./keys";
console.log("Starting bot client in " + keys.NODE_ENV);

import "./client";
