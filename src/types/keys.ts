import { HexColorString } from "discord.js";

export interface Keys {
  clientToken: string;
  topggToken: string;
  testGuild: string;
  logChannel: string;
  audioLogChannel: string;
  color: {
    primary: HexColorString;
    secondary: HexColorString;
  };
  dirname: string;
  NODE_ENV: string;
  id?: string;
}
