import { SlashCommandBuilder } from "discord.js";

const powerups = new Map();

function getGuildStore(guildId) {
  if (!powerups.has(guildId)) {
    powerups.set(guildId, {});
  }
  return powerups.get(guildId);
}

//Checks if user has a freeze powerup.
export function consumeFreeze(guildId, userId) {
  const guildStore = powerups.get(guildId);
  if (!guildStore) return false;

  if (guildStore[userId]?.freeze) {
    delete guildStore[userId].freeze;
    return true;
  }

  return false;
}

export default {
  data: new SlashCommandBuilder()
    .setName("powerup")
    .setDescription("Give yourself a Freeze Time powerup (removes timer for one round)"),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Guild only command.",
        ephemeral: true,
      });
    }

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const guildStore = getGuildStore(guildId);

    // Prevent stacking infinite freezes
    if (guildStore[userId]?.freeze) {
      return interaction.reply({
        content: "❄️ You already have a Freeze Time powerup!",
        ephemeral: true,
      });
    }

    guildStore[userId] = { freeze: true };

    await interaction.reply({
      content:
        "❄️ You received a **Freeze Time** powerup!\n" +
        "It will remove the timer for one round",
      ephemeral: true,
    });
  },
};