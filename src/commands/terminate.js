import { SlashCommandBuilder, PermissionsBitField } from "discord.js";
import { getSession, terminateSession } from "../gameState.js";

export default {
  data: new SlashCommandBuilder()
    .setName("terminate")
    .setDescription("Admin only: immediately end an ongoing trivia game."),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: "Guild only.", ephemeral: true });
    }

    // require administrator privileges
    const member = interaction.member;
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: "You must be a server administrator to use this command.",
        ephemeral: true,
      });
    }

    const guildId = interaction.guild.id;
    const session = getSession(guildId);
    if (!session || !session.active) {
      return interaction.reply({
        content: "No active trivia game to terminate.",
        ephemeral: true,
      });
    }

    terminateSession(guildId);

    // inform admin privately
    await interaction.reply({ content: "✅ Trivia game has been terminated.", ephemeral: true });

    // try to send a public notice to the game text channel if we know it
    if (session && session.textChannelId) {
      const channel = await interaction.guild.channels.fetch(session.textChannelId).catch(() => null);
      if (channel && channel.isText()) {
        channel.send("❌ **Game terminated by administrator.**");
      }
    }
  },
};
