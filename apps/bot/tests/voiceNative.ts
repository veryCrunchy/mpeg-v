import { joinVoiceChannel } from "@discordjs/voice";

if (typeof joinVoiceChannel !== "function") {
  throw new Error("@discordjs/voice did not expose joinVoiceChannel");
}

console.log("voice native import ok");
