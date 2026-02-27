import {
  SlashCommandBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  MessageFlags
} from "discord.js";
import fs from "node:fs";
import { getSession, terminateSession, setSession, clearSession} from "../gameState.js";
import { getVoiceConnection } from "@discordjs/voice";
const VOICE_CHANNEL_NAME = "Game";

async function safeUnlink(p) {
  try {
    await fs.promises.unlink(p);
  } catch (err) {
    if (err?.code !== "ENOENT") console.error("[terminate] unlink failed:", err);
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("terminate")
    .setDescription("Admin only: immediately end an ongoing trivia game."),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: "Guild only.", flags: MessageFlags.Ephemeral });
    }

    const member = interaction.member;
    const isAdmin =
      member?.permissions?.has?.(PermissionsBitField.Flags.Administrator) ?? false;

    if (!isAdmin) {
      return interaction.reply({
        content: "You must be a server administrator to use this command.",
        flags: MessageFlags.Ephemeral,
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

    // flip flags first so the trivia loop stops ASAP
    terminateSession(guildId);

    // re-fetch the updated session (now terminated)
    const s = getSession(guildId);

    // 1) stop timers / collectors immediately
    try {
      if (s?.timerInterval) clearInterval(s.timerInterval);
    } catch {}

    try {
      if (s?.previewStopper) clearTimeout(s.previewStopper);
    } catch {}

    try {
      if (s?.roundCollector && !s.roundCollector.ended) {
        s.roundCollector.stop("terminated");
      }
    } catch {}

    // 2) stop audio immediately
    try {
      s?.player?.stop(true);
    } catch {}

    // 3) disconnect from VC immediately
    try {
      s?.connection?.destroy();
    } catch {}

    // 4) cleanup tmp preview file immediately
    try {
      if (s?.tmpFile) await safeUnlink(s.tmpFile);
    } catch {}

    // 5) disable the active question message buttons (if we know it)
    try {
      if (s?.textChannelId && s?.roundMessageId) {
        const ch = await interaction.guild.channels.fetch(s.textChannelId).catch(() => null);
        if (ch?.isTextBased?.()) {
          const msg = await ch.messages.fetch(s.roundMessageId).catch(() => null);
          if (msg?.components?.length) {
            const disabled = msg.components.map((row) => {
              const rb = ActionRowBuilder.from(row);
              rb.setComponents(row.components.map((c) => ButtonBuilder.from(c).setDisabled(true)));
              return rb;
            });
            await msg.edit({ components: disabled }).catch(() => {});
          }
        }
      }
    } catch {}

    // nuke session references so nothing keeps running
    try {
      if (s) {
        s.timerInterval = null;
        s.previewStopper = null;
        s.roundCollector = null;
        s.player = null;
        s.connection = null;
        s.roundMessageId = null;
        setSession(guildId, s);
      }
    } catch {}

    // tell admin + channel
    await interaction.reply({
      content: "✅ Trivia terminated immediately (audio + round stopped).",
      ephemeral: true,
    });

    if (s?.textChannelId) {
      const ch = await interaction.guild.channels.fetch(s.textChannelId).catch(() => null);
      if (ch?.isTextBased?.()) {
        await ch.send("❌ **Game terminated by administrator.**").catch(() => {});
      }
    }
  },
};