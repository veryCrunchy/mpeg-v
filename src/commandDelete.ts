import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
// Place your client and guild ids here

const rest = new REST({ version: "9" }).setToken("");

console.log("Started refreshing application (/) commands.");

rest
  .put(Routes.applicationCommands(""), {
    body: [],
  })
  .then(() => console.log("Successfully removed application (/) commands."))
  .catch((error) => console.log("Error"));
