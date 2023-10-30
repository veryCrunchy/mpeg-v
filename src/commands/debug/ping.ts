import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { command } from "../../utils";
import keys from "../../keys";
const meta = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Ping the bot for a response.");

export default command(meta, async ({ interaction }) => {
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
