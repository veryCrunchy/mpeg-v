import { HexColorString } from "discord.js";

export interface Keys {
  clientToken: string;
  testGuild: string;
  color: {
    primary: HexColorString;
    secondary: HexColorString;
  };
  NODE_ENV: string;
}
