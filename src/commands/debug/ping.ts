import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { command } from "../../utils";
import keys from "../../keys";
const meta = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Ping the bot for a response.");

export default command(meta, async ({ interaction }) => {
  // const bump = new EmbedBuilder()
  //   .setTitle("DISBOARD: The Public Server List")
  //   .setDescription("Bump done! :thumbsup:\nCheck it out")
  //   .setImage("https://disboard.org/images/bot-command-image-bump.png")
  //   .setColor(0x24b7b7);
  // return interaction.reply({
  //   embeds: [bump],
  // });
  await interaction.deferReply({
    ephemeral: true,
  });

  const ping =
    (await interaction.fetchReply()).createdTimestamp -
    interaction.createdTimestamp;

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .addFields(
          { name: "Client", value: `\`\`\`fix\n${ping}ms\`\`\``, inline: true },
          {
            name: "Websocket (avg)",
            value: `\`\`\`fix\n${interaction.client.ws.ping}ms\`\`\``,
            inline: true,
          }
        )
        .setColor(keys.color.primary),
    ],
  });
});
