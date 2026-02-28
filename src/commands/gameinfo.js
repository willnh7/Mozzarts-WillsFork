import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getSession } from "../gameState.js";

export default {
  data: new SlashCommandBuilder()
    .setName("gameinfo")
    .setDescription("Displays the current trivia session status."),

  async execute(interaction) {
    const guild = interaction.guild;

    if (!guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    const session = getSession(guild.id);

    if (!session || !session.active) {
      return interaction.reply({
        content: "ℹ️ No active trivia session in this server.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x1db954)
      .setTitle("🎮 Trivia Session Info")
      .addFields(
        { name: "Host", value: `<@${session.hostId}>`, inline: true },
        { name: "Difficulty", value: session.difficulty.toUpperCase(), inline: true },
        { name: "Round", value: `${session.round}/${session.totalRounds}`, inline: true },
        { name: "Voice Channel", value: `<#${session.voiceChannelId}>`, inline: true },
        { name: "Text Channel", value: `<#${session.textChannelId}>`, inline: true }
      )
      .setFooter({ text: "Session currently active" });

    await interaction.reply({ embeds: [embed] });
  },
};