import {
  Client,
  Message,
  MessageContextMenuCommandInteraction,
} from "discord.js";
import {
  render,
  MessageReply,
  getBitrate,
  Reply,
  getSize,
  getAudioBitrate,
} from "../utils";
import * as fs from "fs";
import https from "https";
import path from "path";
import { LoggerFunction } from "../types";
import keys from "../keys";

const ALLOWED_EXTENSIONS = ["mp3", "aac", "wav", "flac", "m4a", "ogg"];

export async function generateVideo(
  message: Message,
  log: LoggerFunction,
  client: Client,
  interaction?: MessageContextMenuCommandInteraction
) {
  if (message.flags.bitfield == 8192 && !interaction) return;
  let attachments = message.attachments;
  let messageRef = message.url;
  if (
    message.attachments.size == 0 &&
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
  if (interaction && message.attachments.size == 0)
    return Error("No audio files found.");
  for (const messageAttachment of attachments) {
    const attachment = messageAttachment[1];
    const extension = attachment.name.split(".").pop();
    if (!extension) return;
    if (ALLOWED_EXTENSIONS.includes(extension)) {
      let filepath = `assets/temp/in/${attachment.id}-${attachment.name}`;
      let file = fs.createWriteStream(filepath);
      https.get(attachment.url, function (response) {
        const outputFile = `assets/temp/out/${attachment.id}.mp4`;
        //@ts-ignore
        response.pipe(file);
        file.on("finish", async () => {
          file.close();
          log(
            `started \`${attachment.name}\` :: \`${
              message.guild?.name ?? message.author.username
            }\` : \`${message.guild?.id ?? message.author.id}\``
          );
          let done = await render(
            filepath,
            path.join(keys.dirname, outputFile)
          );
          let size,
            inBitrate = getAudioBitrate(filepath),
            outBitrate = getAudioBitrate(filepath);
          if (typeof done !== "boolean") {
            size = getSize(outputFile);
            log(
              `\`${(done.time as number) / 1000}sec\` :: \`${size}kb\` :: \`${
                attachment.name
              }\` :: \`${
                message.guild?.name ?? message.author.username
              }\` : \`${message.guild?.id ?? message.author.id}\``
            );
            if (size > 25000)
              return Error(`Output file size too large; ${size}/25000kb`);
            const msg = {
              content:
                attachments.size > 1 || interaction
                  ? `[\`\`${
                      attachment.name
                    }\`\`](${messageRef}) ${messageRef}\n-# Completed in ${
                      (done.time as number) / 1000
                    } seconds`
                  : undefined,
              files: [
                {
                  name: `${attachment.name}.mp4`,
                  attachment: path.join(keys.dirname, outputFile),
                },
              ],
            };
            if (interaction) interaction.followUp(msg);
            else message.reply(msg);
          } else {
            Error("Something went wrong whilst generating video");
          }
          if (typeof done !== "boolean") {
            fetch(process.env.API + "/items/conversion_logs", {
              method: "post",
              headers: {
                Authorization: `Bearer ${process.env.API_TOKEN}`,
                Accept: "application/json",
                "Content-Type": "application/json",
              },

              body: JSON.stringify({
                audio_format: extension,
                conversion_time: done.time,
                date_created:
                  interaction?.createdAt ?? new Date().toISOString(),
                file_duration: done.duration,
                file_name: attachment.name,
                guild_id: message.guild?.id ?? "DM",
                input_bitrate: inBitrate,
                input_size: attachment.size,
                output_bitrate: outBitrate,
                output_size: size! * 1000,
                user_id: interaction?.user.id ?? message.author.id,
                cached: false,
                type: interaction ? "menu" : "auto",
              }),
            });
          }
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
        });
      });
    } else {
      if (interaction)
        return Error(
          `Unsupported file type, must be one of the following types:\n\`${ALLOWED_EXTENSIONS.join(
            ", "
          )}\``
        );
    }
  }
  function Error(e?: string) {
    let EMessage = e ?? "Something went wrong..\nPlease try again.";
    interaction
      ? Reply.TempError(interaction, EMessage)
      : MessageReply.TempError(message, EMessage);
  }
}
