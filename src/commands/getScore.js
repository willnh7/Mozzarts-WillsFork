// Admin command to get the score of any player
import { PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { getUserPoints, getUserAllTimePoints } from "../helpers/scoreStore.js";
import { all } from "axios";

export default {
  data: new SlashCommandBuilder()
    .setName("getscore")
    .setDescription("Shows the score of a specific user")
    .addUserOption((option) =>
      option.setName("user").setDescription("The user to get the score for").setRequired(true)
    ),

    // Run the command
  async execute(interaction) {
    // Make sure they are an admin
    const member = interaction.member;
    if(!member.permissions.has(PermissionsBitField.Flags.Administrator)){
        return interaction.reply({
            content: "You must be a server administrator to use this command.",
            ephemeral: true,
        })
    }

    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    const guildId = interaction.guild.id;
    const userId = interaction.options.getUser("user").id;
    const username = interaction.options.getUser("user").username;

    const allTimeScore = getUserAllTimePoints(guildId, userId);

    if(allTimeScore === 0){
      return interaction.reply({
        content: `${username} has never played before, so they have no score.`,
        ephemeral: true,
      });
    }

    const score = getUserPoints(guildId, userId);

    await interaction.reply({
      content: `${username}'s scores\nCurrent score: ${score}\nLifetime score: ${allTimeScore}`,
      ephemeral: true,
    });
  },
};