import { createEvent } from "seyfert";

import { filterAudioFiles, generateVideo } from "utils/generateVideo.ts";

export default createEvent({
  data: { name: "messageCreate" },
  async run(message) {
    const audio = message.attachments;
    console.log(audio);
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
        content: `\`${file.filename} \`\n-# Completed in ${Number(conversionTime) / 1000
          } seconds`,
        files: [attachment],
      });
    }
  },
});
