import { Keys } from "../types";

const keys: Keys = {
  clientToken: process.env.CLIENT_TOKEN ?? "nil",
  topggToken: process.env.TOPGG_TOKEN ?? "null",
  testGuild: process.env.TEST_GUILD ?? "null",
  logChannel: process.env.LOG_CHANNEL ?? "null",
  uptimePushUrl: process.env.UPTIME_PUSH ?? "null",
  audioLogChannel: process.env.AUDIO_LOG_CHANNEL ?? "null",
  color: {
    primary: "#f77627",
    secondary: "#b04c00",
  },
  dirname: __dirname.replace(/\\/g, "/").slice(0, -"/src/keys".length),
  NODE_ENV: process.env.NODE_ENV ?? "production",
};

if (Object.values(keys).includes("nil"))
  throw new Error("Not all ENV variables are defined!");

export default keys;
