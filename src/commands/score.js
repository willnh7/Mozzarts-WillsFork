import { SlashCommandBuilder } from "discord.js";
import { getUserPoints, getUserAllTimePoints } from "../helpers/scoreStore.js";

export default {
  data: new SlashCommandBuilder()
    .setName("score")
    .setDescription("Shows your current score"),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    // Get user info
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // Get stats for that user
    const score = getUserPoints(guildId, userId);
    const allTimeScore = getUserAllTimePoints(guildId, userId);

    await interaction.reply({
      content: `Your scores:\nCurrent score: ${score}\nLifetime score: ${allTimeScore}`,
      ephemeral: true,
    });
  },
};