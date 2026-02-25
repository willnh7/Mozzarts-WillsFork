import { SlashCommandBuilder } from "discord.js";
const scoreStore = require('../helpers/scoreStore.js');

export default {
  data: new SlashCommandBuilder()
    .setName("score")
    .setDescription("Shows a player's current game score")
    .addUserOption(option =>
      option
        .setName("user_name")
        .setDescription("Enter a username (optional)")
        .setRequired(false)
    ),

  async execute(interaction) {
    let userId = interaction.options.getUser("user_name")?.id || interaction.user.id;
    let username = interaction.options.getUser("user_name")?.username || interaction.user.username;
    const allTimeScore = scoreStore.getUserAllTimePoints(interaction.guild.id, userId);
    
    // If scoreStore returned 0 it means the user's score is not recorded
    if(allTimeScore == 0){
      await interaction.reply({
        content : username + " has never played before, so they have no score.",
      });
      return;
    }

    const score = scoreStore.getUserPoints(interaction.guild.id, userId);

    // Tell the score of the user
    await interaction.reply({
      content : username + `'s current score: **${score}**, all time score: **${allTimeScore}**`,
    });
  },
};