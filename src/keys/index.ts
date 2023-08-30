import { Keys } from "../types";

const keys: Keys = {
  clientToken: process.env.CLIENT_TOKEN ?? "nil",
  testGuild: process.env.TEST_GUILD ?? "null",
  color: {
    primary: "#f77627",
    secondary: "#b04c00",
  },
  NODE_ENV: process.env.NODE_ENV ?? "production",
};

if (Object.values(keys).includes("nil"))
  throw new Error("Not all ENV variables are defined!");

export default keys;
