import { TextBasedChannel } from "discord.js";
import { event, render, MessageReply } from "../../utils";
import * as fs from "fs";
import https from "https";
import path from "path";
import keys from "../../keys";
export default event("messageCreate", async ({ log, client }, message) => {
  if (message.author.bot) return;
  if (
    message.flags.bitfield == 8192 ||
    (message.attachments.size == 0 && message.reference == null)
  )
    return;
  let attachments = message.attachments;
  let messageRef = message.url;
  if (
    message.reference !== null &&
    message.content.trim() == `<@${client?.user?.id}>` &&
    message.reference.messageId !== undefined
  ) {
    const m = await message.channel.messages.fetch(message.reference.messageId);
    if (m.attachments) {
      attachments = m.attachments;
      messageRef = m.url;
    }
  }
  for (const messageAttachment of attachments) {
    const attachment = messageAttachment[1];
    const extension = attachment.name.split(".").pop();
    if (!extension) return;
    if (["mp3", "aac", "wav", "flac", "m4a", "ogg"].includes(extension)) {
      let filepath = `assets/temp/in/${attachment.id}-${attachment.name}`;
      let file = fs.createWriteStream(filepath);
      https.get(attachment.url, function (response) {
        response.pipe(file);
        file.on("finish", async () => {
          file.close();
          log(
            `started \`${attachment.name}\` :: \`${message.guild?.name}\` : \`${message.guild?.id}\``
          );
          let done = await render(
            path.join(keys.dirname, "assets/background.png"),
            filepath,
            path.join(keys.dirname, `assets/temp/out/${attachment.id}.mp4`),
            attachments.size > 1
          );
          if (done !== false) {
            log(
              `\`${(done as number) / 1000}sec\` :: \`${
                attachment.name
              }\` :: \`${message.guild?.name}\` : \`${message.guild?.id}\``
            );
            message.reply({
              content:
                attachments.size > 1
                  ? `[${attachment.name}](${messageRef})`
                  : undefined,
              files: [
                {
                  name: `${attachment.name}.mp4`,
                  attachment: path.join(
                    keys.dirname,
                    `assets/temp/out/${attachment.id}.mp4`
                  ),
                },
              ],
            });
          } else {
            MessageReply.TempError(
              message,
              "Something went wrong trying to convert audio to video..\nPlease try again."
            );
          }
        });
      });

      setTimeout(() => {
        fs.unlink(
          path.join(keys.dirname, `assets/temp/out/${attachment.id}.mp4`),
          (err) => {
            if (err) {
              console.error(err);
              return;
            }
          }
        );
        fs.unlink(path.join(keys.dirname, filepath), (err) => {
          if (err) {
            console.error(err);
            return;
          }
        });
      }, 80000);
    }
  }
});
