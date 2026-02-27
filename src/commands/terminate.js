import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from "discord.js";
import { getSession, terminateSession, clearSession } from "../gameState.js";
import { getVoiceConnection } from "@discordjs/voice";

const VOICE_CHANNEL_NAME = "Game";

export default {
  data: new SlashCommandBuilder()
    .setName("terminate")
    .setDescription("Admin only: immediately end an ongoing trivia game."),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: "Guild only.", flags: MessageFlags.Ephemeral });
    }

    // require administrator privileges
    const member = interaction.member;
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: "You must be a server administrator to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildId = interaction.guild.id;
    const session = getSession(guildId);

    // require that a session has been started before
    if (!session) {
      return interaction.reply({ content: "No trivia game has been started.", flags: MessageFlags.Ephemeral });
    }

    const textChannelId = session.textChannelId;

    // mark terminated (safe even if already inactive)
    terminateSession(guildId);

    // stop any collector running the current round so the game loop can end quickly
    if (session.currentCollector) {
      try {
        session.currentCollector.stop("terminated");
      } catch {}
    }

    // Immediately disconnect the bot from the voice channel
    try {
      const voiceConnection = getVoiceConnection(guildId);
      if (voiceConnection) {
        voiceConnection.destroy();
      }
    } catch (err) {
      console.error("Failed to disconnect from voice channel:", err);
    }

    // remove the session entirely so trivia loop stops without further messages
    clearSession(guildId);

    // inform admin privately
    await interaction.reply({ content: "✅ Trivia game has been terminated.", flags: MessageFlags.Ephemeral });

    // send public notice if possible
    if (textChannelId) {
      try {
        const channel = await interaction.guild.channels.fetch(textChannelId).catch(() => null);
        if (channel) {
          await channel.send("❌ **Game was terminated.**").catch(() => {});
        }
      } catch (err) {
        // ignore
      }
    }
  },
};
