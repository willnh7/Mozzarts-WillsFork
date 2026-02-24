import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
} from "discord.js";

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
} from "@discordjs/voice";

import fs from "node:fs";

import { getGenre, getSession, setSession, clearSession } from "../gameState.js";
import { getGuildScoresSorted, addPoints, resetScores } from "../helpers/scoreStore.js";
import { makeHint } from "../helpers/hintHelper.js";
import { makeSongQuestion, createTriviaQuestion, createResultEmbed } from "../helpers/trivia.js";
import { getRandomItunesTrack, downloadPreview } from "../helpers/itunes.js";

const VOICE_CHANNEL_NAME = "Game";
const TEXT_CHANNEL_NAME = "game";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function findVoiceChannel(guild) {
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildVoice && c.name === VOICE_CHANNEL_NAME
  ) ?? null;
}

function findTextChannel(guild, fallbackChannel) {
  const tc =
    guild.channels.cache.find((c) => {
      const okType = c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement;
      return okType && c.name.toLowerCase() === TEXT_CHANNEL_NAME.toLowerCase();
    }) ?? null;
  return tc ?? fallbackChannel ?? null;
}

function normalize(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTitleVariants(title) {
  const t = String(title ?? "");
  const noParens = t.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const noDash = noParens.replace(/\s*-\s*.*$/g, "").trim();
  return [t, noParens, noDash].filter(Boolean);
}




async function safeUnlink(p) {
  try { await fs.promises.unlink(p); } catch {}
}

async function waitForUserInVC(guild, userId, vcId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const member = await guild.members.fetch(userId).catch(() => null);
    const inVc = member?.voice?.channelId === vcId;
    if (inVc) return true;
    await sleep(2500);
  }
  return false;
}

async function ensureVoice(guild, vc) {
  const connection = joinVoiceChannel({
    channelId: vc.id,
    guildId: guild.id,
    adapterCreator: vc.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 30000);

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  connection.subscribe(player);
  return { connection, player };
}

async function playPreview(player, filePath) {
  const resource = createAudioResource(filePath, { inputType: StreamType.Arbitrary });
  player.play(resource);

  await entersState(player, AudioPlayerStatus.Playing, 15000);

  // hard stop at ~32s to match “30 seconds”
  const stopper = setTimeout(() => {
    try { player.stop(true); } catch {}
  }, 32000);

  await new Promise((resolve) => player.once(AudioPlayerStatus.Idle, resolve));
  clearTimeout(stopper);
}

function pointsFor(difficulty, hintsUsed) {
  // scoring is based solely on difficulty; hints no longer exist
  return difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
}

function isCorrectGuess(msgContent, track, difficulty) {
  const guess = normalize(msgContent);

  const titleVariants = stripTitleVariants(track.trackName).map(normalize).filter(Boolean);
  const artistNorm = normalize(track.artistName);

  const titleHit = titleVariants.some(v => v && (guess === v || guess.includes(v)));
  const artistHit = artistNorm && (guess === artistNorm || guess.includes(artistNorm));

  // Difficulty tuning:
  // Easy: title OR artist
  // Medium: title
  // Hard: title AND artist
  if (difficulty === "easy") return titleHit || artistHit;
  if (difficulty === "medium") return titleHit;
  return titleHit && artistHit;
}

export const _test = {
  normalize,
  pointsFor,
};

export default {
  data: new SlashCommandBuilder()
    .setName("trivia")
    .setDescription("Start a 10-question music trivia game (requires VC: Game, text: #game)."),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: "Guild only.", ephemeral: true });

    const existing = getSession(guild.id);
    if (existing?.active) {
      return interaction.reply({ content: "⚠️ Trivia is already running in this server.", ephemeral: true });
    }

    // Difficulty selection UI
    const embed = new EmbedBuilder()
      .setColor(0x1db954)
      .setTitle("🎵 Music Trivia")
      .setDescription(`Select a difficulty to begin (10 questions). You’ll hear a 30s preview and then have 15 seconds to answer each multiple-choice question. A replay button allows one additional listen per song. A hint button provides a single clue per round.`)
      .addFields(
        { name: "Easy", value: "1 point • artist or genre questions", inline: true },
        { name: "Medium", value: "2 points • album or track-title questions", inline: true },
        { name: "Hard", value: "3 points • release-year questions", inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("trivia_difficulty_easy").setLabel("Easy").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("trivia_difficulty_medium").setLabel("Medium").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("trivia_difficulty_hard").setLabel("Hard").setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    const pickMsg = await interaction.fetchReply();

    const difficulty = await new Promise((resolve) => {
      const collector = pickMsg.createMessageComponentCollector({
        time: 60000,
        max: 1,
        filter: (i) =>
          i.user.id === interaction.user.id &&
          i.customId.startsWith("trivia_difficulty_"),
      });

      collector.on("collect", async (i) => {
        await i.deferUpdate();
        resolve(i.customId.replace("trivia_difficulty_", ""));
      });

      collector.on("end", async (collected) => {
        if (!collected.size) resolve(null);
      });
    });

    // disable difficulty buttons
    try {
      const disabledRow = new ActionRowBuilder().addComponents(
        row.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
      );
      await pickMsg.edit({ components: [disabledRow] });
    } catch {}

    if (!difficulty) {
      return interaction.followUp({ content: "⏱️ Difficulty selection timed out. Run **/trivia** again.", ephemeral: true });
    }

    const vc = findVoiceChannel(guild);
    const tc = findTextChannel(guild, interaction.channel);

    if (!vc) {
      return interaction.followUp({ content: `❌ Missing voice channel **${VOICE_CHANNEL_NAME}**.`, ephemeral: true });
    }
    if (!tc) {
      return interaction.followUp({ content: `❌ Missing text channel **#${TEXT_CHANNEL_NAME}**.`, ephemeral: true });
    }

    // Session init (flowchart: instructions given)
    resetScores(guild.id);

    const session = {
      active: true,
      guildId: guild.id,
      hostId: interaction.user.id,
      difficulty,
      totalRounds: 10,
      round: 0,
      currentTrack: null,
      textChannelId: tc.id,
      voiceChannelId: vc.id,
    };
    setSession(guild.id, session);

    const genre = getGenre(guild.id);

    await tc.send(
      `📢 **Music Trivia started!**\n` +
      `Difficulty: **${difficulty.toUpperCase()}** • Genre: **${genre}**\n\n` +
      `➡️ Join voice channel **${VOICE_CHANNEL_NAME}**.\n` +
      `✅ You’ll hear **30s** of a song preview.\n` +
      `💬 After the preview ends you’ll have **15 seconds** to answer using the multiple-choice buttons in <#${tc.id}>.\n` +
      `🔁 A replay button lets you hear the song one more time; using it restarts the timer (only once per round).\n` +
      `💡 A hint button provides one clue per round.\n`
    );

    // flowchart: User in Game channel? (loop)
    const ok = await waitForUserInVC(guild, interaction.user.id, vc.id, 120000);
    if (!ok) {
      clearSession(guild.id);
      return tc.send(`❌ <@${interaction.user.id}> didn’t join **${VOICE_CHANNEL_NAME}** in time. Game cancelled.`);
    }

    // Connect once for all 10 rounds
    let connection = null;
    let player = null;
    try {
      const voice = await ensureVoice(guild, vc);
      connection = voice.connection;
      player = voice.player;

      for (let round = 1; round <= 10; round++) {
        const s = getSession(guild.id);
        if (!s?.active) break;

        // flowchart: Prepare next song + ensure still in VC
        const stillInVc = await waitForUserInVC(guild, interaction.user.id, vc.id, 60000);
        if (!stillInVc) {
          await tc.send(`⚠️ <@${interaction.user.id}> please re-join **${VOICE_CHANNEL_NAME}** to continue...`);
          const back = await waitForUserInVC(guild, interaction.user.id, vc.id, 120000);
          if (!back) {
            await tc.send(`❌ Game cancelled (host didn’t rejoin VC).`);
            break;
          }
        }

        // Round state
        // always pull a fresh random track; previous connection logic
        // (e.g. from /game) has been removed and is no longer relevant.
        const track = await getRandomItunesTrack(genre);
        const tmp = await downloadPreview(track.previewUrl);

        const updated = getSession(guild.id);
        updated.round = round;
        updated.currentTrack = track;
        updated.tmpFile = tmp;
        setSession(guild.id, updated);

        const listenEmbed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(`🎧 Round ${round}/10`)
          .setDescription(`Listening for **30 seconds**...`)
          .addFields(
            { name: "Difficulty", value: difficulty.toUpperCase(), inline: true },
            { name: "Genre", value: String(genre).toUpperCase(), inline: true }
          );

        const listenMsg = await tc.send({ embeds: [listenEmbed] });

              // flowchart: User listens to song for 30 seconds
        try {
          await playPreview(player, tmp);
        } catch (e) {
          // if FFmpeg isn't installed, give a helpful message and abort the game
          if (String(e.message).includes("FFmpeg/avconv not found")) {
            await tc.send("❌ Audio playback failed: FFmpeg is not installed on the server. Please install it before running trivia.");
          } else {
            await tc.send(`❌ Audio playback error: ${e.message}`);
          }
          throw e; // rethrow to trigger outer cleanup
        }

        // immediately build the question and UI components; players have 10
        // seconds to respond once the preview stops (no music will be playing).
        const question = await makeSongQuestion(track, difficulty);
        const { embed: questionEmbed, actionRow: answerRow } = createTriviaQuestion(question);

        // question row plus control row (replay button)
        const controlRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("trivia_replay")
            .setLabel("Replay")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(false),
          new ButtonBuilder()
            .setCustomId("trivia_hint")
            .setLabel("Hint")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(false)
        );

        // when you are given answer choices
        const roundMsg = await tc.send({ embeds: [questionEmbed], components: [answerRow, controlRow] });
  
        let replayUsed = false;
        let hintUsed = false;

        let winner = { correct: false, userId: null };
        const answeredUsers = new Set();

        const componentCollector = roundMsg.createMessageComponentCollector({ time: 15000 });

        // visual timer
        let timeLeft = 15;
        let timerInterval = null;
        function startTimer() {
          clearInterval(timerInterval);
          timeLeft = 15;

          timerInterval = setInterval(async () => {
            if (timeLeft <= 0) return;
            timeLeft--;

            try {
              const updatedEmbed = EmbedBuilder.from(questionEmbed)
                .setFooter({ text: `⏳ Time left: ${timeLeft}s` });

              await roundMsg.edit({
                embeds: [updatedEmbed],
                components: [answerRow, controlRow],
              });
            } catch {}
          }, 1000);
        }
        startTimer();


        // when we restart via replay we will reset this collector’s timer
        componentCollector.on("collect", async (i) => {
          // answers can only be attempted once per user
          if (i.customId.startsWith("trivia_answer_")) {
            if (answeredUsers.has(i.user.id)) {
              await i.reply({ content: "You already answered this round.", ephemeral: true });
              return;
            }
            answeredUsers.add(i.user.id);

            const idx = parseInt(i.customId.replace("trivia_answer_", ""), 10);
            const selected = question.options[idx];
            if (selected === question.correctAnswer) {
              winner = { correct: true, userId: i.user.id };
              clearInterval(timerInterval);

              // shade correct button green and disable all
              const newRows = ActionRowBuilder.from(answerRow).setComponents(
                answerRow.components.map((b) =>
                  b.data.custom_id === i.customId
                    ? ButtonBuilder.from(b).setStyle(ButtonStyle.Success).setDisabled(true)
                    : ButtonBuilder.from(b).setDisabled(true)
                )
              );
await roundMsg.edit({ components: [newRows] });

              await i.deferUpdate();
              componentCollector.stop("correct");
            } else {
              clearInterval(timerInterval); // stop timer 
              // shade wrong button red and disable just it
              const newRow = ActionRowBuilder.from(answerRow).setComponents(
                answerRow.components.map((b) =>
                  b.data.custom_id === i.customId
                    ? ButtonBuilder.from(b).setStyle(ButtonStyle.Danger).setDisabled(true)
                    : b
                )
              );
                await roundMsg.edit({ components: [newRow] });
              await i.reply({ content: "❌ Wrong answer!", ephemeral: true });
              componentCollector.stop("answered");
            }
            return;
          }

          if (i.customId === "trivia_replay") {
            // only once per round
            if (replayUsed) {
              await i.reply({ content: "Replay already used for this song.", ephemeral: true });
              return;
            }
            replayUsed = true;
            const ss = getSession(guild.id);
            if (!ss?.active || !ss.tmpFile) {
              await i.reply({ content: "Replay unavailable.", ephemeral: true });
              return;
            }
            // disable the replay button only
            try {
              const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
                controlRow.components.map((b) =>
                  b.data.custom_id === "trivia_replay"
                    ? ButtonBuilder.from(b).setDisabled(true)
                    : ButtonBuilder.from(b)
                )
              );
              await roundMsg.edit({ components: [answerRow, disabledCtrl] });
            } catch {}

            await i.deferUpdate();
            // replay audio and reset timer
            (async () => {
              try {
                try { player.stop(true); } catch {}
                const resource = createAudioResource(ss.tmpFile, {
                  inputType: StreamType.Arbitrary,
                });
                player.play(resource);
                const stopper = setTimeout(() => {
                  try { player.stop(true); } catch {}
                }, 32000);
                await new Promise((resolve) =>
                  player.once(AudioPlayerStatus.Idle, resolve)
                );
                clearTimeout(stopper);
              } catch (err) {
                console.error("Replay failed:", err);
              }
            })();
            startTimer();
            componentCollector.resetTimer({ time: 15000 });
            return;
          }

          if (i.customId === "trivia_hint") {
            if (hintUsed) {
              await i.reply({ content: "Hint already used this round.", ephemeral: true });
              return;
            }
            hintUsed = true;
            await i.deferUpdate();
            const hint = makeHint(track, 1, difficulty);
            await tc.send({ content: `💡 Hint: ${hint}`, ephemeral: true });
            // disable the hint button
            try {
              const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
                controlRow.components.map((b) =>
                  b.data.custom_id === "trivia_hint"
                    ? ButtonBuilder.from(b).setDisabled(true)
                    : ButtonBuilder.from(b)
                )
              );
              await roundMsg.edit({ components: [answerRow, disabledCtrl] });
            } catch {}
            return;
          }

        });

        // wrap the end handler in a promise so the outer loop can await it
        const endPromise = new Promise((resolve) => {
          componentCollector.on("end", async (collected, reason) => {
            // when round ends highlight correct answer if nobody already chose it
            try {
              const highlighted = ActionRowBuilder.from(answerRow).setComponents(
                answerRow.components.map((b) => {
                  const btn = ButtonBuilder.from(b);
                  const idx = parseInt(btn.data.custom_id.replace("trivia_answer_", ""), 10);
                  if (question.options[idx] === question.correctAnswer) {
                    btn.setStyle(ButtonStyle.Success);
                  }
                  return btn.setDisabled(true);
                })
              );
              await roundMsg.edit({ components: [highlighted] });
            } catch {}

            const ss = getSession(guild.id);
            const answerLine = `✅ **${track.trackName}** — **${track.artistName}**`;

            if (winner.correct && winner.userId) {
              const pts = pointsFor(difficulty);
              addPoints(guild.id, winner.userId, pts);
              const top = getGuildScoresSorted(guild.id).slice(0, 5);
              const topLines = top.map(([uid, p], idx) => `${idx + 1}. <@${uid}> — **${p}**`).join("\n");

              const resultEmbed = createResultEmbed(question, question.correctAnswer, { username: `<@${winner.userId}>` });
              await tc.send({ embeds: [resultEmbed] });
              await tc.send(`🏆 **Top Scores**\n${topLines}`);
            } else {
              await tc.send(`❌ Time! No correct guesses.\n${answerLine}`);
            }

            // cleanup file + message from listening phase

            // brief 5 second pause before next round; gives players a breather
            await sleep(5000);
            try {
              const ss2 = getSession(guild.id);
              if (ss2?.tmpFile) {
                await safeUnlink(ss2.tmpFile);
                ss2.tmpFile = null;
                setSession(guild.id, ss2);
              }
            } catch {}

            // old shorter delay removed (handled above)
            try { await listenMsg.delete().catch(() => {}); } catch {}

            resolve();
          });
        });
        // pause here until the round’s collector has finished firing its end handler
        await endPromise;




      }

      // flowchart: Answered 10 questions? -> end
      const final = getGuildScoresSorted(guild.id);
      if (!final.length) {
        await tc.send("🏁 Game over! No points scored.");
      } else {
        const lines = final.slice(0, 10).map(([uid, pts], i) => `${i + 1}. <@${uid}> — **${pts}**`);
        await tc.send(`🏁 **Game over! Final scoreboard:**\n${lines.join("\n")}`);
      }
    } catch (e) {
      console.error("[trivia] CRASH:", e?.stack || e);
      try {
        await tc.send(`❌ Trivia crashed: \`${String(e?.message || e).slice(0, 180)}\``);
      } catch {}
    } finally {
      // cleanup
      try { connection?.destroy(); } catch {}
      clearSession(guild.id);
    }
  },

  
};