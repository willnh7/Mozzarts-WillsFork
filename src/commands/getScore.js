// Admin command to get the score of any player
// A player must be specified
import { PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { getUserPoints, getUserAllTimePoints } from "../helpers/scoreStore.js";

export default {
  data: new SlashCommandBuilder()
    .setName("getscore")
    .setDescription("Shows the score of a specific user")
    .addUserOption((option) =>
      option.setName("user").setDescription("The user to get the score for").setRequired(true)
    ),

  // The code that runs each time the command is called
  async execute(interaction) {
    // Make sure the person running the command is an admin
    const member = interaction.member;
    if(!member.permissions.has(PermissionsBitField.Flags.Administrator)){
        return interaction.reply({ // End early if not an admin
            content: "You must be a server administrator to use this command.",
            ephemeral: true,
        })
    }

    // Make sure the command is being run with a guild
    if (!interaction.guild) {
      return interaction.reply({ // End early if there is no guild
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    // If it has reached this point, then the command should run like normal

    // Get the guild id, and the user id and username of the person specified by the command executor
    const guildId = interaction.guild.id;
    const userId = interaction.options.getUser("user").id;
    const username = interaction.options.getUser("user").username;

    // Get the current score and lifetime score of the specified user
    const score = getUserPoints(guildId, userId);
    const allTimeScore = getUserAllTimePoints(guildId, userId);

    // Tell the command executor the scores of the specified user
    await interaction.reply({
      content: `${username}'s scores:\nCurrent score: ${score}\nLifetime score: ${allTimeScore}`,
      ephemeral: true,
    });
  },
};
