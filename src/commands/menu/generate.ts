import {
  ApplicationCommandType,
  MessageContextMenuCommandInteraction,
} from "discord.js";
import { command, generateVideo } from "../../utils";
import { CommandMeta, ExtendedContextMenuCommandBuilder } from "../../types";

const data: CommandMeta = new ExtendedContextMenuCommandBuilder()
  .setName("Generate Video")
  .setDescription("Generates a video from all audio files in that message.")
  .setType(ApplicationCommandType.Message);
data.integration_types = [0, 1];
data.contexts = [0, 1, 2];
export default command(data, async ({ interaction, log, client }) => {
  interaction = interaction as MessageContextMenuCommandInteraction;
  await interaction.deferReply();
  generateVideo(interaction.targetMessage, log, client, interaction);
});
