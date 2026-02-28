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
import { resetScores, addPoints, getGuildScoresSorted } from "../helpers/scoreStore.js";
import { addRoundPlayed, addRoundWon, addGamePlayed, addGameWon } from "../helpers/statsStore.js";
import { makeHint } from "../helpers/hintHelper.js";
import { makeSongQuestion, createTriviaQuestion, createResultEmbed } from "../helpers/triviaHelper.js";
import { getRandomItunesTrack, downloadPreview } from "../helpers/itunes.js";
import { consumeFreeze , consumeDoublePoints} from "./powerup.js";

const VOICE_CHANNEL_NAME = "Game";
const TEXT_CHANNEL_NAME = "game";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Looks for the vc w/specified name.
 * @param {*} guild
 * @returns the vc with the name specified, or null if not found. specified name is required.
 */
function findVoiceChannel(guild) {
  return (
    guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildVoice && c.name === VOICE_CHANNEL_NAME
    ) ?? null
  );
}

/**
 * Finds the tc for the game, first looks for the channel with the specified name,
 * if not found it falls back to the channel the command was invoked in.
 * null if neither is found which is handled later to let the user know they need to set up a tc for the game.
 *
 * @param {*} guild
 * @param {*} fallbackChannel
 * @returns the tc or fallback on the channel
 */
function findTextChannel(guild, fallbackChannel) {
  const tc =
    guild.channels.cache.find((c) => {
      const okType = c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement;
      return okType && c.name.toLowerCase() === TEXT_CHANNEL_NAME.toLowerCase();
    }) ?? null;
  return tc ?? fallbackChannel ?? null;
}

/**
 * This function attempts to delete the file at the given path, but catches and logs any errors that occur during deletion.
 * Used to clean up temp files.
 * @param {*} p file path
 */
async function safeUnlink(p) {
  try {
    await fs.promises.unlink(p);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`Failed to delete file at ${p}:`, err);
    }
  }
}

/**
 * Waits for the user to be in the specified vc by checking every 2.5 s or until the timeout is reached.
 * If the user is in the vc then it returns true, else false after timeout.
 * @param {*} guild
 * @param {*} userId
 * @param {*} vcId
 * @param {*} timeoutMs
 * @returns false if the user is not in vc and true if they are, it checks
 * every 2.5 s until timeout which is 2 min by default
 */
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

/**
 * This function ensures that the bot is connected to the vc and that the audio player is set up to play previews.
 * This will be called at the start of the game to establish a connection that can be used throughout the game
 * to play previews without reconnecting each time.
 * @param {*} guild
 * @param {*} vc
 * @returns the connection and the player which is used to play the previews and manage the audio in the vc.
 */
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

/**
 * Creates an audio resource from the given file path and plays the preview for
 * for 30 seconds. It waits for the audio player to play before proceeding and
 * then it hard stops the preview at around 32 seconds to make sure it doesn't play
 * longer than 30s and also prevents any issues.
 * Then it waits until the player finishes or is stopped before resolving and continuing w/the game flow.
 *
 * @param {*} player
 * @param {*} filePath
 */
async function playPreview(player, filePath, guildId) {
  const resource = createAudioResource(filePath, { inputType: StreamType.Arbitrary });
  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 15000);

  const stopper = setTimeout(() => {
    try {
      player.stop(true);
    } catch (err) {
      console.error("Audio Playback Error:", err);
    }
  }, 32000);

  // store stopper so /terminate can clear it instantly
  try {
    const ss = getSession(guildId);
    if (ss) {
      ss.previewStopper = stopper;
      setSession(guildId, ss);
    }
  } catch {}

  await new Promise((resolve) => player.once(AudioPlayerStatus.Idle, resolve));
  clearTimeout(stopper);

  // clear stored stopper
  try {
    const ss2 = getSession(guildId);
    if (ss2?.previewStopper === stopper) {
      ss2.previewStopper = null;
      setSession(guildId, ss2);
    }
  } catch {}
}

/**
 * Determines the number of points to award based on difficulty( not hints used yet).
 * @param {*} difficulty
 * @param {*} hintsUsed
 * @returns
 */
function pointsFor(difficulty, hintsUsed) {
  return difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
}

// utility used by tests; not part of the command logic itself
function normalize(str) {
  return String(str)
    .replace(/\([^\)]*\)/g, "")
    .replace(/[\p{P}$+<=>^`|~]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const _test = {
  pointsFor,
  normalize,
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
      .setDescription(
        `Select a difficulty to begin (10 questions). You’ll hear a 30s preview and then have 15 seconds to answer each multiple-choice question. A replay button allows one additional listen per song. A hint button provides a single clue per round.`
      )
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

    try {
      const disabledRow = new ActionRowBuilder().addComponents(
        row.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
      );
      await pickMsg.edit({ components: [disabledRow] });
    } catch (err) {
      console.error("Failed to disable buttons:", err);
      await interaction.followUp({
        content: "⚠️ Selection failed. Please try again in a moment.",
        ephemeral: true,
      });
    }

    if (!difficulty) {
      return interaction.followUp({
        content: "⏱️ Difficulty selection timed out. Run **/trivia** again to play again!",
        ephemeral: true,
      });
    }

    const vc = findVoiceChannel(guild);
    const tc = findTextChannel(guild, interaction.channel);

    if (!vc) {
      return interaction.followUp({ content: `❌ Missing voice channel **${VOICE_CHANNEL_NAME}**.`, ephemeral: true });
    }
    if (!tc) {
      return interaction.followUp({ content: `❌ Missing text channel **#${TEXT_CHANNEL_NAME}**.`, ephemeral: true });
    }

    resetScores(guild.id);

    const session = {
      active: true,
      terminated: false,
      guildId: guild.id,
      hostId: interaction.user.id,
      difficulty,
      totalRounds: 10,
      round: 0,
      currentTrack: null,
      textChannelId: tc.id,
      voiceChannelId: vc.id,

      // runtime handles for instant termination
      connection: null,
      player: null,
      roundCollector: null,
      timerInterval: null,
      previewStopper: null,
      roundMessageId: null,
      tmpFile: null,
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

    const ok = await waitForUserInVC(guild, interaction.user.id, vc.id, 120000);
    if (!ok) {
      clearSession(guild.id);
      return tc.send(`❌ <@${interaction.user.id}> didn’t join **${VOICE_CHANNEL_NAME}** in time. Game cancelled.`);
    }

    let connection = null;
    let player = null;

    try {
      const voice = await ensureVoice(guild, vc);
      connection = voice.connection;
      player = voice.player;
      // Keep track of every user who has wrote an answer so their games played stat can be updated
      const playersAcrossAllRounds = new Set();
      // The 10 rounds are here, this is the core gameplay loop where we play previews, collect answer, and manage the state for each round.
      // TODO: Add a way to break out of the loop early if there are no players or if the admin wants to end the game early.(Maybe even user who invoked it too?)

      const ssVoice = getSession(guild.id);
      if (ssVoice) {
        ssVoice.connection = connection;
        ssVoice.player = player;
        setSession(guild.id, ssVoice);
      }

      for (let round = 1; round <= 10; round++) {
        const s = getSession(guild.id);
        if (s?.terminated) break;
        if (!s?.active) break;

        const stillInVc = await waitForUserInVC(guild, interaction.user.id, vc.id, 60000);
        if (!stillInVc) {
          await tc.send(`⚠️ <@${interaction.user.id}> please re-join **${VOICE_CHANNEL_NAME}** to continue...`);
          const back = await waitForUserInVC(guild, interaction.user.id, vc.id, 120000);
          if (!back) {
            await tc.send(`❌ Game cancelled (host didn’t rejoin VC).`);
            break;
          }
        }

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

        try {
          await playPreview(player, tmp, guild.id);

          const sAfterPreview = getSession(guild.id);
          if (!sAfterPreview?.active || sAfterPreview?.terminated) {
            try { await safeUnlink(tmp); } catch {}
            try { await listenMsg.delete().catch(() => {}); } catch {}

            try {
              const ss = getSession(guild.id);
              if (ss?.tmpFile === tmp) {
                ss.tmpFile = null;
                setSession(guild.id, ss);
              }
            } catch {}

            break;
          }
        } catch (err) {
          if (String(err.message).includes("FFmpeg/avconv not found")) {
            await tc.send(
              "❌ Audio playback failed: FFmpeg is not installed on the server. Please install it before running trivia."
            );
          } else {
            await tc.send(`❌ Audio playback err: ${err.message}`);
          }
          throw err;
        }

        const question = await makeSongQuestion(track, difficulty);
        
        const { embed: questionEmbed, actionRow: answerRow } = createTriviaQuestion(question);

        // question row plus control row (replay button)
        // For hard difficulty, disable the hint button since no hints are allowed
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
            .setDisabled(difficulty === "hard")
        );

        const roundMsg = await tc.send({
          embeds: [questionEmbed],
          components: [answerRow, controlRow],
        });

        const ssRoundMsg = getSession(guild.id);
        if (ssRoundMsg) {
          ssRoundMsg.roundMessageId = roundMsg.id;
          setSession(guild.id, ssRoundMsg);
        }

        let replayUsed = false;
        let hintUsed = false;

        let winner = { correct: false, userId: null };
        const answeredUsers = new Set();

        const freezeActive = consumeFreeze(guild.id, interaction.user.id);
        if (freezeActive) {
          await tc.send(`❄️ Freeze Time activated! No timer this round.`);
        }
        const doublePtsActive = consumeDoublePoints(guild.id, interaction.user.id);
        if(doublePtsActive) {
          await tc.send(`💰 **Double Points** activated! You will earn **${question.points * 2}** points if you guess right!`);
        }

        const collectorOptions = {};
        if (!freezeActive) {
          collectorOptions.time = 15000;
        }

        const componentCollector = roundMsg.createMessageComponentCollector(collectorOptions);

        const ssCollector = getSession(guild.id);
        if (ssCollector) {
          ssCollector.roundCollector = componentCollector;
          setSession(guild.id, ssCollector);
        }

        let timeLeft = 15;
        let timerInterval = null;

        function startTimer() {
          clearInterval(timerInterval);
          timeLeft = 15;
          // This is the countdown for the timer
          timerInterval = setInterval(async () => {
            if (timeLeft <= 0) return;
            timeLeft--;

            try {
              const updatedEmbed = EmbedBuilder.from(questionEmbed).setFooter({
                text: `⏳ Time left: ${timeLeft}s`,
              });

              await roundMsg.edit({
                embeds: [updatedEmbed],
                components: [answerRow, controlRow],
              });
            } catch (err) {
              console.error("Failed to update timer UI", err);
            }
          }, 1000);

          // store interval immediately so /terminate can clear it instantly
          try {
            const ssTimer = getSession(guild.id);
            if (ssTimer) {
              ssTimer.timerInterval = timerInterval;
              setSession(guild.id, ssTimer);
            }
          } catch {}
        }

        if (!freezeActive) startTimer();

        // when we restart via replay we will reset this collector’s timer
        componentCollector.on("collect", async (i) => {
          const st = getSession(guild.id);
          if (!st?.active || st?.terminated) {
            try { await i.deferUpdate(); } catch {}
            return;
          }

          // ===== ANSWERS =====
          if (i.customId.startsWith("trivia_answer_")) {
            if (answeredUsers.has(i.user.id)) {
              await i.reply({ content: "You already answered this round.", ephemeral: true });
              return;
            }
            answeredUsers.add(i.user.id);
            playersAcrossAllRounds.add(i.user.id);
            addRoundPlayed(guild.id, i.user.id); // increase their rounds played stat
            // determine which answer they selected based on the customID of the button they clicked and check if correct
            const idx = parseInt(i.customId.replace("trivia_answer_", ""), 10);
            const selected = question.options[idx];
            if (selected === question.correctAnswer) { // if their answer was correct
              winner = { correct: true, userId: i.user.id };
              try { clearInterval(timerInterval); } catch {}

              const newAnswerRow = ActionRowBuilder.from(answerRow).setComponents(
                answerRow.components.map((b) =>
                  b.data.custom_id === i.customId
                    ? ButtonBuilder.from(b).setStyle(ButtonStyle.Success).setDisabled(true)
                    : ButtonBuilder.from(b).setDisabled(true)
                )
              );

              const newControlRow = ActionRowBuilder.from(controlRow).setComponents(
                controlRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
              );

              await roundMsg.edit({ components: [newAnswerRow, newControlRow] }).catch(() => {});
              await i.deferUpdate();
              componentCollector.stop("correct");
              return;
            }

            const newAnswerRow = ActionRowBuilder.from(answerRow).setComponents(
              answerRow.components.map((b) =>
                b.data.custom_id === i.customId
                  ? ButtonBuilder.from(b).setStyle(ButtonStyle.Danger).setDisabled(true)
                  : ButtonBuilder.from(b)
              )
            );

            await roundMsg.edit({ components: [newAnswerRow, controlRow] }).catch(() => {});
            await i.reply({ content: "❌ Wrong answer!", ephemeral: true });
            return;
          }

          // ===== REPLAY =====
          if (i.customId === "trivia_replay") {
            if (replayUsed) {
              await i.reply({ content: "Replay already used for this song.", ephemeral: true });
              return;
            }
            replayUsed = true;

            const ss = getSession(guild.id);
            if (!ss?.active || ss?.terminated || !ss.tmpFile) {
              await i.reply({ content: "Replay unavailable.", ephemeral: true });
              return;
            }

            try {
              const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
                controlRow.components.map((b) =>
                  b.data.custom_id === "trivia_replay"
                    ? ButtonBuilder.from(b).setDisabled(true)
                    : ButtonBuilder.from(b)
                )
              );
              await roundMsg.edit({ components: [answerRow, disabledCtrl] }).catch(() => {});
            } catch {}

            await i.deferUpdate();

            (async () => {
              try {
                try { player.stop(true); } catch {}

                const resource = createAudioResource(ss.tmpFile, { inputType: StreamType.Arbitrary });
                player.play(resource);

                const stopper = setTimeout(() => {
                  try { player.stop(true); } catch {}
                }, 32000);

                try {
                  const st2 = getSession(guild.id);
                  if (st2) {
                    st2.previewStopper = stopper;
                    setSession(guild.id, st2);
                  }
                } catch {}

                await new Promise((resolve) => player.once(AudioPlayerStatus.Idle, resolve));
                clearTimeout(stopper);

                try {
                  const st3 = getSession(guild.id);
                  if (st3?.previewStopper === stopper) {
                    st3.previewStopper = null;
                    setSession(guild.id, st3);
                  }
                } catch {}
              } catch {}
            })();

            if (!freezeActive) {
              startTimer();
              componentCollector.resetTimer({ time: 15000 });
            }
            return;
          }

          // ===== HINT =====
          if (i.customId === "trivia_hint") {
            // hints are not allowed for hard difficulty
            if (difficulty === "hard") {
              await i.reply({ content: "Hints are not allowed for hard difficulty.", ephemeral: true });
              return;
            }
            if (hintUsed) {
              await i.reply({ content: "Hint already used this round.", ephemeral: true });
              return;
            }
            hintUsed = true;

            try {
              const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
                controlRow.components.map((b) =>
                  b.data.custom_id === "trivia_hint"
                    ? ButtonBuilder.from(b).setDisabled(true)
                    : ButtonBuilder.from(b)
                )
              );
              await roundMsg.edit({ components: [answerRow, disabledCtrl] }).catch(() => {});
            } catch {}

            const hint = makeHint(track, question.type);
            await i.reply({ content: `💡 Hint: ${hint}`, ephemeral: true }).catch(async () => {
              await tc.send(`💡 Hint: ${hint}`).catch(() => {});
            });
            return;
          }
        });

        const endPromise = new Promise((resolve) => {
          componentCollector.on("end", async (_collected, reason) => {
            const stEnd = getSession(guild.id);

            if (reason === "terminated" || !stEnd?.active || stEnd?.terminated) {
              try { clearInterval(timerInterval); } catch {}

              try {
                const disabledAnswer = ActionRowBuilder.from(answerRow).setComponents(
                  answerRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
                );
                const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
                  controlRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
                );
                await roundMsg.edit({ components: [disabledAnswer, disabledCtrl] }).catch(() => {});
              } catch {}

              try {
                const ss2 = getSession(guild.id);
                if (ss2?.tmpFile) {
                  await safeUnlink(ss2.tmpFile);
                  ss2.tmpFile = null;
                  setSession(guild.id, ss2);
                }
              } catch {}

              try { await listenMsg.delete().catch(() => {}); } catch {}

              resolve();
              return;
            }

            // when round ends highlight correct answer if nobody already chose it
            try {
              const highlighted = ActionRowBuilder.from(answerRow).setComponents(
                answerRow.components.map((b) => {
                  const btn = ButtonBuilder.from(b);
                  const idx = parseInt(btn.data.custom_id.replace("trivia_answer_", ""), 10);
                  if (question.options[idx] === question.correctAnswer) btn.setStyle(ButtonStyle.Success);
                  return btn.setDisabled(true);
                })
              );

              const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
                controlRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
              );

              await roundMsg.edit({ components: [highlighted, disabledCtrl] }).catch(() => {});
            } catch {}

            const answerLine = `✅ **${track.trackName}** — **${track.artistName}**`;

            if (winner.correct && winner.userId) {
              let pts = pointsFor(difficulty);
              
              if(doublePtsActive) {
                pts *= 2;
                // Changes the question points to display the double points gained
                question.points *= 2;
              }
              addPoints(guild.id, winner.userId, pts);
              addRoundWon(guild.id, winner.userId); // increase their rounds won stat
              const top = getGuildScoresSorted(guild.id).slice(0, 5);
              const topLines = top.map(([uid, p], idx) => `${idx + 1}. <@${uid}> — **${p}**`).join("\n");

              const resultEmbed = createResultEmbed(question, question.correctAnswer, {
                username: `<@${winner.userId}>`,
              });

              await tc.send({ embeds: [resultEmbed] });
              await tc.send(`🏆 **Top Scores**\n${topLines}`);
            } else {
              await tc.send(`❌ Time! No correct guesses.\n${answerLine}`);
            }

            await sleep(5000);

            try {
              const ss2 = getSession(guild.id);
              if (ss2?.tmpFile) {
                await safeUnlink(ss2.tmpFile);
                ss2.tmpFile = null;
                setSession(guild.id, ss2);
              }
            } catch {}

            try { await listenMsg.delete().catch(() => {}); } catch {}

            resolve();
          });
        });

        await endPromise;
        const stAfterRound = getSession(guild.id);
        if (stAfterRound?.terminated || !stAfterRound?.active) break;
      }

      // flowchart: Answered 10 questions? -> end
      // Handles the end of the game logic by getting the final scores, 
      // displaying the final leaderboard, cleaning up the session and connection, 
      // and updating stats for all who played'
      for(const userId of playersAcrossAllRounds) {
        addGamePlayed(guild.id, userId); // increase their games played stat
      }
      const final = getGuildScoresSorted(guild.id);
      if (!final.length) {
        await tc.send("🏁 Game over! No points scored.");
      } else {
        const highestScorer = final[0];
        addGameWon(guild.id, highestScorer[0]); // increase their games won stat
        const lines = final.slice(0, 10).map(([uid, pts], i) => `${i + 1}. <@${uid}> — **${pts}**`);
        await tc.send(`🏁 **Game over! Final scoreboard:**\n${lines.join("\n")}`);
      }

      // ===== END OF GAME (SKIP IF TERMINATED) =====
      const stFinal = getSession(guild.id);
      if (!stFinal?.terminated) {
        const final = getGuildScoresSorted(guild.id);
        if (!final.length) {
          await tc.send("🏁 Game over! No points scored.");
        } else {
          const lines = final
            .slice(0, 10)
            .map(([uid, pts], i) => `${i + 1}. <@${uid}> — **${pts}**`);
          await tc.send(`🏁 **Game over! Final scoreboard:**\n${lines.join("\n")}`);
        }
      }
    } finally {
      // cleanup (always)
      try {
        const s = getSession(guild.id);
        if (s?.timerInterval) clearInterval(s.timerInterval);
      } catch {}

      try { player?.stop(true); } catch {}
      try { connection?.destroy(); } catch {}

      try {
        const s = getSession(guild.id);
        if (s?.tmpFile) await safeUnlink(s.tmpFile);
      } catch {}

      clearSession(guild.id);
    }
  },
};