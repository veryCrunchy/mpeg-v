import {
  Client,
  Message,
  MessageContextMenuCommandInteraction,
} from "discord.js";
import { render, MessageReply, EditReply, Reply } from "../utils";
import * as fs from "fs";
import https from "https";
import path from "path";
import { LoggerFunction } from "../types";
import keys from "../keys";
export async function generateVideo(
  message: Message,
  log: LoggerFunction,
  client: Client,
  interaction?: MessageContextMenuCommandInteraction
) {
  if (
    message.flags.bitfield == 8192 ||
    (message.attachments.size == 0 && message.reference == null)
  )
    return;
  let attachments = message.attachments;
  let messageRef = message.url;
  if (
    message.reference !== null &&
    message.content.trim() == `<@${client.user?.id}>` &&
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
            filepath,
            path.join(keys.dirname, `assets/temp/out/${attachment.id}.mp4`),
          );
          if (done !== false) {
            log(
              `\`${(done as number) / 1000}sec\` :: \`${
                attachment.name
              }\` :: \`${message.guild?.name}\` : \`${message.guild?.id}\``
            );
            const msg = {
              content:
                attachments.size > 1 || interaction
                  ? `[\`\`${attachment.name}\`\`](${messageRef}) ${messageRef}`
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
            };
            if (interaction) interaction.followUp(msg);
            else message.reply(msg);
          } else {
            interaction
              ? interaction?.reply(
                  Reply.error("Something went wrong..\nPlease try again.")
                )
              : MessageReply.TempError(
                  message,
                  "Something went wrong..\nPlease try again."
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
}
