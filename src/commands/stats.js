// Gets the stats for the person who runs the command
import { SlashCommandBuilder } from "discord.js";
import { getRoundsPlayed, getRoundsWon, getGamesPlayed, getGamesWon } from "../helpers/statsStore.js";

export default {
    data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Shows your stats for music trivia"),

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
        const roundsPlayed = getRoundsPlayed(guildId, userId);
        const roundsWon = getRoundsWon(guildId, userId);
        const gamesPlayed = getGamesPlayed(guildId, userId);
        const gamesWon = getGamesWon(guildId, userId);

        await interaction.reply({
          content: `Your stats:\nRounds played: ${roundsPlayed}\nRounds won: ${roundsWon}\nGames played: ${gamesPlayed}\nGames won: ${gamesWon}`,
          ephemeral: true,
        });
      },
};