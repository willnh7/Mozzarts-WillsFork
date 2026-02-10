// Command to start a music trivia game [VERSION .01]
// Note: bug with the selection, once there is a selections, it should do?

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, userMention, CommandInteraction } from "discord.js";

const scoreStore = require('../helpers/scoreStore.js');

export default {
  data: new SlashCommandBuilder()
    .setName("trivia")
    .setDescription("Start a music trivia game!"),

  async execute(interaction) {
    // Create difficulty selection embed
    const embed = new EmbedBuilder()
      .setColor(0x1db954)
      .setTitle("🎵 Music Trivia")
      .setDescription("Select a difficulty level to begin!")
      .addFields(
        { name: "Easy", value: "1 point per correct answer", inline: true },
        { name: "Medium", value: "2 points per correct answer", inline: true },
        { name: "Hard", value: "3 points per correct answer", inline: true }
      );

    // Create difficulty buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("trivia_difficulty_easy")
        .setLabel("Easy")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("trivia_difficulty_medium")
        .setLabel("Medium")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("trivia_difficulty_hard")
        .setLabel("Hard")
        .setStyle(ButtonStyle.Danger)
    );

    // Add an entry in scoreStore for the user who started the game if not already there
    user = interaction.user.tag;
    scoreStore.addScore(user, 0);

    // Send difficulty selection
    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};
