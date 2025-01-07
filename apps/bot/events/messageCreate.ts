// TODO: fix seyfert interaction.guild and message.guild type overlap
// import { createEvent } from "seyfert";
// import { createItem } from "@mpeg-v/utils";
// import { BotItem } from "@mpeg-v/types";
// import {
//   filterFiles,
//   formatFileSize,
//   generateVideo,
// } from "utils/generateVideo.ts";
// export default createEvent({
//   data: { name: "messageCreate" },
//   async run(message, client) {
//     console.log(message);

//     const audio = message.attachments;
//     const filteredFiles = filterFiles(audio);
//     if (!filteredFiles) return;

//     for (const file of filteredFiles) {
//       const [attachment, res] = await generateVideo(
//         file,
//         message,
//         "slash",
//       );
//       const conversionTime = res.headers.get("Conversion-Time");
//       return message.reply({
//         content: `\`${audio.filename} (${
//           formatFileSize(file.size)
//         })\`\n-# Completed in ${Number(conversionTime) / 1000} seconds`,
//         files: [attachment],
//       });
//     }
//   },
//   // override onRunError(message: CommandContext, error: Error) {
//   //   return handleError(message, error);
//   // }
// });
