import { InteractionResponse, SlashCommandBuilder } from "discord.js";
const scoreStore = require('../helpers/scoreStore.js');

export default {
  data: new SlashCommandBuilder()
    .setName("score")
    .setDescription("Shows a player's current game score")
    .addStringOption(option =>
      option
        .setName("user_name")
        .setDescription("Enter a username (optional)")
        .setRequired(false)
    ),

  async execute(interaction) {
    let username = interaction.options.getString("user_name");

    // If no username argument provided, set it to command runner's username
    if(username == null){
      username = interaction.user.tag;
    }
    const score = scoreStore.getScore(username);

    // If scoreStore returned -1 it means the user's score is not recorded
    if(score == -1){
      await interaction.reply({
        content : username + " has never played before, so they have no score.",
      });
      return;
    }

    // Tell the score of the user
    await interaction.reply({
      content : username + `'s current score: **${score}**`,
    });
  },
};