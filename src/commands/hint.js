import { SlashCommandBuilder } from "discord.js";
import * as hintHelper from "../helpers/hintHelper.js";

export default {
  data: new SlashCommandBuilder()
    .setName("hint")
    .setDescription("Get a hint")
    .addStringOption(option =>
      option
        .setName("song_name")
        .setDescription("Choose a song")
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      const input = interaction.options.getString("song_name");
      const hint = hintHelper.getHint?.(input) ?? "No hint available.";

      await interaction.reply({
        content: `Here is your hint: ${hint}`
      });

    } catch (err) {
      console.error("Hint command error:", err);
      await interaction.reply({
        content: "Something went wrong while generating the hint.",
        ephemeral: true
      });
    }
  }
};