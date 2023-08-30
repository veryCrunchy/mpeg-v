import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { command, duration } from "../../utils";
import os from "os";

const meta = new SlashCommandBuilder()
  .setName("info")
  .setDescription("Information about the bot");

export default command(meta, async ({ interaction }) => {
  const app = interaction.client.application;
  const text = interaction.client.user.username;
  const icon = interaction.client.user.displayAvatarURL();
  try {
    const botinfo = new EmbedBuilder()
      .setAuthor({
        name: `${text}`,
        iconURL: `${icon}`,
      })
      .setTitle("__**Stats:**__")
      .setColor("#FF760F")

      .addFields(
        {
          name: "⏳ Memory Usage",
          value: `\`${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(
            2
          )}/ ${(os.totalmem() / 1024 / 1024).toFixed(2)}MB\``,
          inline: true,
        },
        {
          name: "⌚️ Uptime ",
          value: `${duration(interaction.client.uptime)
            .map((i) => `\`${i}\``)
            .join(", ")}`,
          inline: true,
        },
        {
          name: "\u200b",
          value: "\u200b",
          inline: true,
        }
      );
    //   .addField(
    //     "📁 Users",
    //     `\`Total: ${interaction.client.users.cache.size} Users\``,
    //     true
    //   )
    //   .addField(
    //     "📁 Servers",
    //     `\`Total: ${interaction.client.guilds.cache.size} Servers\``,
    //     true
    //   )
    //   .addField("\u200b", "\u200b", true)
    //   .addField(
    //     "📁 Voice-Channels",
    //     `\`${
    //       interaction.client.channels.cache.filter(
    //         (ch) =>
    //           ch.type === "GUILD_VOICE" || ch.type === "GUILD_STAGE_VOICE"
    //       ).size
    //     }\``,
    //     true
    //   )
    //   .addField(
    //     "🔊 Connections",
    //     `\`${connectedchannelsamount} Connections\``,
    //     true
    //   )
    //   .addField("\u200b", "\u200b", true)
    //   .addField("👾 Discord.js", `\`v${Discord.version}\``, true)
    //   .addField("🤖 Node", `\`${process.version}\``, true)
    //   .addField("\u200b", "\u200b", true)
    //   .addField(
    //     "🤖 CPU",
    //     `\`\`\`md\n${os.cpus().map((i) => `${i.model}`)[0]}\`\`\``
    //   )
    //   .addField("🤖 CPU usage", `\`${percent.toFixed(2)}%\``, true)
    //   .addField("🤖 Arch", `\`${os.arch()}\``, true)
    //   .addField("\u200b", "\u200b", true)
    //   .addField("💻 Platform", `\`\`${os.platform()}\`\``, true)
    //   .addField("API Latency", `\`${interaction.client.ws.ping}ms\``, true)
    //       .setFooter({
    //         text: `Coded by: ${
    //           app.owner?. + "#" + app.owner?
    //         }`,
    //       });
    interaction.reply({
      embeds: [botinfo],
    });
    //   } catch (e) {
    //     console.log(e);
    //     let connectedchannelsamount = 0;
    //     const guilds = interaction.client.guilds.cache.map((guild) => guild);
    //     for (let i = 0; i < guilds.length; i++) {
    //       if (guilds[i].me.voice.channel) connectedchannelsamount += 1;
    //     }
    //     if (connectedchannelsamount > interaction.client.guilds.cache.size) {
    //       connectedchannelsamount = interaction.client.guilds.cache.size;
    //     }
    //     const botinfo = new EmbedBuilder()
    //       .setAuthor({
    //         name: `${text}`,
    //         iconURL: `${icon}`,
    //       })
    //       .setTitle("__**Stats:**__")
    //       .setColor("#FF760F")
    //       .addField(
    //         "⏳ Memory Usage",
    //         `\`${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}/ ${(
    //           os.totalmem() /
    //           1024 /
    //           1024
    //         ).toFixed(2)}MB\``,
    //         true
    //       )
    //       .addField(
    //         "⌚️ Uptime ",
    //         `${duration(interaction.client.uptime)
    //           .map((i) => `\`${i}\``)
    //           .join(", ")}`,
    //         true
    //       )
    //       .addField("\u200b", "\u200b", true)
    //       .addField(
    //         "📁 Users",
    //         `\`Total: ${interaction.client.users.cache.size} Users\``,
    //         true
    //       )
    //       .addField(
    //         "📁 Servers",
    //         `\`Total: ${interaction.client.guilds.cache.size} Servers\``,
    //         true
    //       )
    //       .addField("\u200b", "\u200b", true)
    //       .addField(
    //         "📁 Voice-Channels",
    //         `\`${
    //           interaction.client.channels.cache.filter(
    //             (ch) =>
    //               ch.type === "GUILD_VOICE" || ch.type === "GUILD_STAGE_VOICE"
    //           ).size
    //         }\``,
    //         true
    //       )
    //       .addField(
    //         "🔊 Connections",
    //         `\`${connectedchannelsamount} Connections\``,
    //         true
    //       )
    //       .addField("\u200b", "\u200b", true)
    //       .addField("👾 Discord.js", `\`v${Discord.version}\``, true)
    //       .addField("🤖 Node", `\`${process.version}\``, true)
    //       .addField("\u200b", "\u200b", true)
    //       .addField(
    //         "🤖 CPU",
    //         `\`\`\`md\n${os.cpus().map((i) => `${i.model}`)[0]}\`\`\``
    //       )
    //       .addField("🤖 CPU usage", `\`${percent.toFixed(2)}%\``, true)
    //       .addField("🤖 Arch", `\`${os.arch()}\``, true)
    //       .addField("\u200b", "\u200b", true)
    //       .addField("💻 Platform", `\`\`${os.platform()}\`\``, true)
    //       .addField("API Latency", `\`${interaction.client.ws.ping}ms\``, true)
    //       .setFooter({
    //         text: `Coded by: ${
    //           app.owner.username + "#" + app.owner.discriminator
    //         }`,
    //       });
    // interaction.reply({
    //   embeds: [botinfo],
    // });
    //   }

    return;
  } catch (e) {
    console.log(e);
  }
});
