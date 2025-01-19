import { inspect } from "node:util";
import { AttachmentBuilder } from "seyfert";
import { createEvent, Message, UsingClient } from "seyfert";

import { filterAudioFiles, generateVideo } from "utils/generateVideo.ts";
const ownerId = "576097150359044106";
export default createEvent({
  data: { name: "messageCreate" },
  async run(message, client) {
    const commandRegex = new RegExp(`meval`);
    if (commandRegex.test(message.content) && message.author.id === ownerId) {
      return evalHandle(message, client);
    }

    const audio = message.attachments;
    let filteredFiles;
    try {
      filteredFiles = filterAudioFiles(audio);
    } catch {
      return;
    }

    for (const file of filteredFiles!) {
      const [attachment, res] = await generateVideo(
        file,
        message,
        "slash",
      );
      const conversionTime = res.headers.get("Conversion-Time");
      return message.reply({
        content: `\`${file.filename} \`\n-# Completed in ${
          Number(conversionTime) / 1000
        } seconds`,
        files: [attachment],
      });
    }
  },
});

async function evalHandle(message: Message, client: UsingClient) {
  try {
    let evalResult;
    evalResult = await eval(`(async () => {${message.content.slice(5)}})()`);

    evalResult = inspect(evalResult, {
      depth: 1,
    });
    let files = undefined;
    let content: string | undefined = evalResult.replaceAll(
      message.client.rest.options.token,
      "nu-uh",
    );
    if (content.length > 1000) {
      files = [
        new AttachmentBuilder({
          type: "buffer",
          resolvable: new TextEncoder().encode(
            content,
          ),
          filename: "evalResult.ts",
        }),
      ];
      content = undefined;
    } else {
      content = `\`\`\`js\n ${content}\`\`\``;
    }
    return message.reply({
      content,
      files,
    });
  } catch (err) {
    await message.reply({ content: `\`\`\`xl\n${err}\`\`\`` });
  }
  return;
}
