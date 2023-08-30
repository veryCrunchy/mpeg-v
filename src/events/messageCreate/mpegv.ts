import keys from "../../keys";
import { event, render, MessageReply } from "../../utils";
import { EmbedBuilder } from "discord.js";
import * as fs from "fs";
import https from "https";
export default event("messageCreate", async ({ log, client }, message) => {
  if (message.author.bot) return;
  if (!message.attachments) return;

  for (const messageAttachment of message.attachments) {
    const attachment = messageAttachment[1];
    const extension = attachment.name.split(".").pop();
    if (!extension) return;
    if (["mp3", "aac", "wav", "flac", "m4a", "ogg"].includes(extension)) {
      let filepath = `src/temp/in/${attachment.id}-${attachment.name}`;
      let file = fs.createWriteStream(filepath);

      https.get(attachment.url, function (response) {
        response.pipe(file);
        file.on("finish", async () => {
          file.close();
          let done = await render(
            "src/temp/background.png",
            filepath,
            `src/temp/out/${attachment.id}.mp4`
          );
          if (done) {
            const disposeCollector = message.channel.createMessageCollector({
              filter: (m) => m.id == message.id,
              time: 20 * 60 * 1000,
            }); // collect for 20 minutes

            fs.readFile(
              `src/temp/out/${attachment.id}.mp4`,
              async (err, data) => {
                let sentMessage = await message.reply({
                  files: [
                    {
                      name: `${attachment.name}.mp4`,
                      attachment: `src/temp/out/${attachment.id}.mp4`,
                    },
                  ],
                });

                disposeCollector.on("dispose", () => {
                  console.log("disposed");
                  sentMessage.delete();
                  disposeCollector.stop();
                });
              }
            );
          } else {
            MessageReply.TempError(
              message,
              "Something went wrong trying to convert audio to video..\nPlease try again."
            );
          }
        });
      });

      setTimeout(() => {
        fs.unlink(`src/temp/out/${attachment.id}.mp4`, (err) => {
          if (err) {
            console.error(err);
            return;
          }
        });
        fs.unlink(filepath, (err) => {
          if (err) {
            console.error(err);
            return;
          }
        });
      }, 80000);
    }
  }
});
