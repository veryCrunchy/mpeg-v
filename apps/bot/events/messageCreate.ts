import { createEvent } from "seyfert";
import { generateVideo, isValidAudioFile } from "utils/generateVideo.ts";

export default createEvent({
  data: { name: "messageCreate" },
  async run(message) {
    // Avoid conversion loops and never execute source code from chat messages.
    if (message.author.bot || message.webhookId) return;
    const files = message.attachments.filter((file) =>
      isValidAudioFile(file.filename)
    );
    for (const file of files) {
      try {
        const [attachment, res] = await generateVideo(file, message, "auto");
        await message.reply({
          content: `Completed in ${
            Number(res.headers.get("Conversion-Time")) / 1000
          } seconds`,
          files: [attachment],
          allowed_mentions: { parse: [], replied_user: false },
        });
      } catch {
        await message.reply({
          content:
            "This audio could not be converted. Try a smaller file or use /generate video for details.",
          allowed_mentions: { parse: [], replied_user: false },
        });
      }
    }
  },
});
