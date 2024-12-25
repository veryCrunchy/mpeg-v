import keys from "../keys";
import { event, render } from "../utils";

const process = require("node:process");
import * as fs from "fs";
const path = require("path");
const ready = event("ready", async ({ log }, client) => {
  process.send = process.send || function () {};
  process.send("ready");
  process.on("unhandledRejection", (reason: Error) => {
    console.log(" [antiCrash] :: Unhandled Rejection/Catch");
    console.log(reason.stack);
  });
  process.on("uncaughtException", (err: Error) => {
    console.log(" [antiCrash] :: Uncaught Exception/Catch");
    console.log(err.stack);
  });
  process.on("uncaughtExceptionMonitor", (err: Error) => {
    console.log(" [antiCrash] :: Uncaught Exception/Catch (MONITOR)");
    console.log(err.stack);
  });

  if (keys.uptimePushUrl !== "null") {
    const url = new URL(keys.uptimePushUrl);
    fetch(url);
    setInterval(() => {
      url.searchParams.set("ping", client.ws.ping.toString());
      url.searchParams.set("msg", client.guilds.cache.size.toString());
      fetch(url);
    }, 30000);
  }
  log(`Logged in as ${client.user.tag}`);
  // let filepath = `src/temp/in/1137755613556916324-1sec.mp3`;
  // render("165010.png", filepath, `src/temp/out/1137755613556916324-1sec.mp4`);
  fs.readdir(path.join(keys.dirname, "assets/temp/in"), (err, files) => {
    if (err) throw err;

    for (const file of files) {
      fs.unlink(path.join(keys.dirname, "assets/temp/in", file), (err) => {
        if (err) throw err;
      });
    }
  });
  fs.readdir(path.join(keys.dirname, "assets/temp/out"), (err, files) => {
    if (err) throw err;

    for (const file of files) {
      fs.unlink(path.join(keys.dirname, "assets/temp/out", file), (err) => {
        if (err) throw err;
      });
    }
  });
});
const onJoin = event("guildCreate", async ({ client, embedLog }, guild) => {
  const owner = await guild.fetchOwner();
  fetch(process.env.API + "/items/science_installs", {
    method: "post",
    headers: {
      Authorization: `Bearer ${process.env.API_TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      guild_id: guild.id,
      user_id: owner.id,
      is_user: false,
      is_install: true,
    }),
  });
  let guildIcon;
  let userIcon;
  if (guild.iconURL() !== null) guildIcon = guild.iconURL() as string;
  if (owner.user.avatarURL() !== null)
    userIcon = owner.user.avatarURL() as string;
  embedLog({
    author: {
      name: `${guild.name} :: ${guild.id}`,
      icon_url: guildIcon,
    },
    color: 9433951,
    footer: {
      text: `${owner.displayName}${
        owner.user.username !== owner.displayName.toLowerCase()
          ? ` :: ${owner.user.username}`
          : ""
      } :: ${owner.id}`,
      icon_url: userIcon,
    },
  });
});
const onLeave = event("guildDelete", async ({ client, embedLog }, guild) => {
  if (!guild.available) return;
  fetch(process.env.API + "/items/science_installs", {
    method: "post",
    headers: {
      Authorization: `Bearer ${process.env.API_TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      guild_id: guild.id,
      user_id: guild.ownerId,
      is_user: false,
      is_install: false,
    }),
  });

});

export default [ready, onJoin, onLeave];
