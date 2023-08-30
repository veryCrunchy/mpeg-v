import { event, render } from "../utils";
const process = require("node:process");
import * as fs from "fs";
const path = require("path");
export default event("ready", ({ log }, client) => {
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

  log(`Logged in as ${client.user.tag}`);
  // let filepath = `src/temp/in/1137755613556916324-1sec.mp3`;

  // render("165010.png", filepath, `src/temp/out/1137755613556916324-1sec.mp4`);
  fs.readdir("src/temp/in", (err, files) => {
    if (err) throw err;

    for (const file of files) {
      fs.unlink(path.join("src/temp/in", file), (err) => {
        if (err) throw err;
      });
    }
  });
  fs.readdir("src/temp/out", (err, files) => {
    if (err) throw err;

    for (const file of files) {
      fs.unlink(path.join("src/temp/out", file), (err) => {
        if (err) throw err;
      });
    }
  });
});
