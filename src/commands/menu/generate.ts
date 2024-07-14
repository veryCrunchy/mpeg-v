import {
  ApplicationCommandType,
  MessageContextMenuCommandInteraction,
} from "discord.js";
import { command, generateVideo } from "../../utils";
import { CommandMeta, ExtendedContextMenuCommandBuilder } from "../../types";

const data1: CommandMeta = new ExtendedContextMenuCommandBuilder()
  .setName("Generate Video")
  .setDescription("Generates a video for all audio files in that message.")
  .setType(ApplicationCommandType.Message);
const data2: CommandMeta = new ExtendedContextMenuCommandBuilder()
  .setName("Generate Video (Private)")
  .setDescription("Generates a video for all audio files in that message and sends it ephemerally.")
  .setType(ApplicationCommandType.Message);

export default [
  command(data1, async ({ interaction, log, client }) => {
    interaction = interaction as MessageContextMenuCommandInteraction;
    await interaction.deferReply();
    generateVideo(interaction.targetMessage, log, client, interaction);
  }),
  command(data2, async ({ interaction, log, client }) => {
    interaction = interaction as MessageContextMenuCommandInteraction;
    await interaction.deferReply({ ephemeral: true });
    generateVideo(interaction.targetMessage, log, client, interaction);
  }),
];
