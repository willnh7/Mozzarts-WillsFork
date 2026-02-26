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
import { makeHint } from "../helpers/hintHelper.js";
import { makeSongQuestion, createTriviaQuestion, createResultEmbed } from "../helpers/triviaHelper.js";
import { getRandomItunesTrack, downloadPreview } from "../helpers/itunes.js";

const VOICE_CHANNEL_NAME = "Game";
const TEXT_CHANNEL_NAME = "game";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
//const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/**
 * Looks for the vc w/specified name.
 * @param {*} guild 
 * @returns the vc with the name specified, or null if not found. specified name is required.
 */
function findVoiceChannel(guild) {
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildVoice && c.name === VOICE_CHANNEL_NAME
  ) ?? null;
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
    // Code 'ENOENT' means the file wasn't there (which we expect sometimes)
    // If it's NOT that, we should probably know about it.
    if (err.code !== 'ENOENT') {
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
async function playPreview(player, filePath) {
  // Audio resource from the downloaded preview file 
  const resource = createAudioResource(filePath, { inputType: StreamType.Arbitrary });
  // Plays the preview
  player.play(resource);
  // Waits until the player is in the Playing state, with a timeout of 15 seconds to prevent hanging if something goes wrong with playback.
  await entersState(player, AudioPlayerStatus.Playing, 15000);

  // hard stop at ~32s to match “30 seconds”
  const stopper = setTimeout(() => {
    try { player.stop(true); } catch (err) {console.err("Audio Playback Error:", err);}
  }, 32000);
  // Wait until the player stops which will ensure we don't proceed w/the game w/o the preview having finished(or timeout)
  await new Promise((resolve) => player.once(AudioPlayerStatus.Idle, resolve));
  clearTimeout(stopper);
}
//TODO: Make use of hints
/**
 * Determines the number of points to award based on difficulty( not hints used yet).
 * 
 * 
 * @param {*} difficulty 
 * @param {*} hintsUsed 
 * @returns 
 */
function pointsFor(difficulty, hintsUsed) {
  // scoring is based solely on difficulty; hints no longer exist
  return difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
}
/**
 * This export is used only for internal testing of the question normalization
 * and scoring logic, which are not directly invoked by the command handler and thus not easily testable.
 */
// utility used by tests; not part of the command logic itself
function normalize(str) {
  // strip parentheses and their contents, punctuation, collapse spaces,
  // and lowercase.  the tests expect "song abc" not "song  abc".
  return String(str)
    .replace(/\([^\)]*\)/g, "") // remove parentheses content
    .replace(/[\p{P}$+<=>^`|~]/gu, "") // remove most punctuation via Unicode property
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const _test = {
  pointsFor,
  normalize,
};
/**
 * This is the main command export in which the user can invoke to run
 * a game of trivia. The command handler manages the whole gameplay flow, including:
 * - Difficulty selection
 * - Voice channel connection
 * - Round management (playing previews, collecting answers, scoring)
 * - Final scoreboard display
 * 
 * The command relies heavily on the helper functions and game state management
 * to keep track of the current session, scores, and question generation. Essentially following
 * OOP principles. (Note: the code does need to be simplified and cleaned up)
 */
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
    // Difficulty selection buttons for users to select 
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("trivia_difficulty_easy").setLabel("Easy").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("trivia_difficulty_medium").setLabel("Medium").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("trivia_difficulty_hard").setLabel("Hard").setStyle(ButtonStyle.Danger)
    );

    // Send the message and wait for the user to select a difficulty.
    await interaction.reply({ embeds: [embed], components: [row] });
    const pickMsg = await interaction.fetchReply();
    /**
     * The collector listens for the button and resolves with the selected difficulty
     * and also handles the case where the user takes too long to respond(timeout, and aborts game).
     * Once selection is made or timeout, we disable the buttons.
     */
    const difficulty = await new Promise((resolve) => {
      const collector = pickMsg.createMessageComponentCollector({
        // Timeout limit(60 sec)
        time: 60000,
        max: 1,
        // Filter to ensure the user who initiated the command can click the buttons and only those buttons.
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

    // Disable difficulty buttons, if not already disabled. Prevents multiple selections
    try {
      const disabledRow = new ActionRowBuilder().addComponents(
        row.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
      );
      await pickMsg.edit({ components: [disabledRow] });
    } catch (err) {
      console.err("Failed to disable buttons:", err);
      await interaction.followUp({ 
        content: "⚠️ Selection failed. Please try again in a moment.", 
        ephemeral: true 
      });
    }
    // If the difficulty selection timeout occurs, we tell the userr and abort the game setup. They can run the command again to start again
    if (!difficulty) {
      return interaction.followUp({ content: "⏱️ Difficulty selection timed out. Run **/trivia** again to play again!", ephemeral: true });
    }

    // Finds the vc that the bot will enter to play the music previews
    const vc = findVoiceChannel(guild);
    // Finds the text channel where the bot will post the questions
    const tc = findTextChannel(guild, interaction.channel);

    // If the required vc and tc are not found we abort and let the user know to set them up.
    if (!vc) {
      return interaction.followUp({ content: `❌ Missing voice channel **${VOICE_CHANNEL_NAME}**.`, ephemeral: true });
    }

    if (!tc) {
      return interaction.followUp({ content: `❌ Missing text channel **#${TEXT_CHANNEL_NAME}**.`, ephemeral: true });
    }

    // Session init (flowchart: instructions given)
    // This resets scores for all users in the guild,
    // TODO: find a way to preserve scores across multiple games while still allowing for new players to join with 0 points.
    // Have a admin manually reset scores command so that scores can persist across games?
    resetScores(guild.id);

    // This session object will be used to keep track of the current game state.
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
    // Sets the session in the global game state so that it can be accessed by other parts of the code to manage the games flow and state.
    setSession(guild.id, session);
    // Gets the genre preference for the guild, maybe have it just for the game and add a genre picker?
    const genre = getGenre(guild.id);
    // Sends the initial instructions message to the text channel, outlining the rules and how to play the game.
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
    // Check if the user in the Game vc channel before starting the game. We give 
    // them 2 minutes before aborting the game setup. 
    const ok = await waitForUserInVC(guild, interaction.user.id, vc.id, 120000);
    // If they are not in the vc after 2 minutes we clear the session and abort the game setup.
    if (!ok) {
      clearSession(guild.id);
      return tc.send(`❌ <@${interaction.user.id}> didn’t join **${VOICE_CHANNEL_NAME}** in time. Game cancelled.`);
    }

    // Connect once for all 10 rounds instead of connecting and reconnecting for each round.
    let connection = null;
    let player = null;
    // We wrap the whole game flow in a try catch finally to ensure that if err occur we can clean up 
    // the connection and session in the finally block to prevent orphaned connections or sessions that block future games from starting.
    try {
      // Joins the vc and sets up the audio player
      const voice = await ensureVoice(guild, vc);
      // We keep the connection and player in variables that can be accessed and used throughout the game.
      connection = voice.connection;
      player = voice.player;
      // The 10 rounds are here, this is the core gameplay loop where we play previews, collect answer, and manage the state for each round.
      // TODO: Add a way to break out of the loop early if there are no players or if the admin wants to end the game early.(Maybe even user who invoked it too?)
      for (let round = 1; round <= 10; round++) {
        const s = getSession(guild.id);
        // check for an administrator-initiated termination first so we can
        // deliver a channel-wide notification before abandoning the loop.
        if (s?.terminated) {
          await tc.send(`❌ Game terminated by administrator.`);
          break;
        }
        if (!s?.active) break;

        // flowchart: Prepare next song + ensure still in VC
        const stillInVc = await waitForUserInVC(guild, interaction.user.id, vc.id, 60000);
        // If the player is no longer in the vc after the song is over and an additional 1 min period, we pause the game and ask them to rejoin.
        // If they don't rejoin then we abort and clear the session.
        if (!stillInVc) {
          await tc.send(`⚠️ <@${interaction.user.id}> please re-join **${VOICE_CHANNEL_NAME}** to continue...`);
          //TODO: Prone to a bug if multiple users are playing and the host leaves, maybe have the
          // the game be to a single player or have a way to transfer host if the host leaves?(Just an idea that we may not have the time for)
          const back = await waitForUserInVC(guild, interaction.user.id, vc.id, 120000);
          if (!back) {
            await tc.send(`❌ Game cancelled (host didn’t rejoin VC).`);
            break;
          }
        }

        // Round state
        // always pull a fresh random track; previous connection logic
        // (err.g. from /game) has been removed and is no longer relevant.
        const track = await getRandomItunesTrack(genre);
        const tmp = await downloadPreview(track.previewUrl);
      
        const updated = getSession(guild.id);
        updated.round = round;
        updated.currentTrack = track;
        updated.tmpFile = tmp;
        // Sets the current track and tmp file in the session and updates the round so that it can be accessed by the answer collection logic
        // and the replay button logic to manage the game state and flow properly
        setSession(guild.id, updated);

        // Sends a message to tc to indicate the round is starting and that the preview is playing. Just UI feedback
        // and also to allow the user to know how long the preview plays for.
        const listenEmbed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(`🎧 Round ${round}/10`)
          .setDescription(`Listening for **30 seconds**...`)
          .addFields(
            { name: "Difficulty", value: difficulty.toUpperCase(), inline: true },
            { name: "Genre", value: String(genre).toUpperCase(), inline: true }
          );
        // We keep a reference to this message so that we can delete it after the preview is over to keep the channel clean.
        const listenMsg = await tc.send({ embeds: [listenEmbed] });

        // flowchart: User listens to song for 30 seconds -> question + answers are shown in tc
        try {
          // Plays the preview in the vc
          await playPreview(player, tmp);
        } catch (err) {
          // if FFmpeg isn't installed, give a helpful message and abort the game
          if (String(err.message).includes("FFmpeg/avconv not found")) {
            await tc.send("❌ Audio playback failed: FFmpeg is not installed on the server. Please install it before running trivia.");
          } else {
            await tc.send(`❌ Audio playback err: ${err.message}`);
          }
          throw err; // rethrow to trigger outer cleanup
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

        // when you are given answer choices and buttons
        const roundMsg = await tc.send({ 
          embeds: [questionEmbed], 
          components: [answerRow, controlRow] 
        });
  
        // assigns the state for the replay and the hint usage to ensure only used once per round.
        // Could be prone to the err of users spamming the buttons, so disabling the buttons immediately after use 
        // is needed to prevent that and ensure the game flow is good
        // TODO: The replay is longer than the time available to answer the question so that can be an issue
        let replayUsed = false;
        let hintUsed = false;

        // for tracking the winner of the round
        let winner = { correct: false, userId: null };
        const answeredUsers = new Set();

        // Creates a collector for the answer and control buttons
        const componentCollector = roundMsg.createMessageComponentCollector({ time: 15000 });

        // visual timer
        //
        let timeLeft = 15;
        let timerInterval = null;
        // starts the timer and updates the embed footer every second to show how much time is left.
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
            } catch(err) {
              console.err("Failed to update timer UI", err);
            }
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
            // we add the user to a set of users who already answered to prevent multiple tries
            answeredUsers.add(i.user.id);
            // determine which answer they selected based on the customID of the button they clicked and check if correct
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
              // potential to end round early, we should let other users answer until someone gets it right or the timer runs out
              componentCollector.stop("answered");
            }
            return;
          }
          // Handles the replay button logic only allowing the user to replay once
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
            } catch (err) {
              console.err("Failed to update replay button UI:", err);
            }
            await i.deferUpdate();
            // replay audio and reset timer
            (async () => {
              try {
                try { player.stop(true); } catch (err) { console.err("Critical Audio Error:", err);}
                const resource = createAudioResource(ss.tmpFile, {
                  inputType: StreamType.Arbitrary,
                });
                player.play(resource);
                const stopper = setTimeout(() => {
                  try { player.stop(true); } catch (err) { console.err("Playback err occurred:", err);}
                }, 32000);
                await new Promise((resolve) =>
                  player.once(AudioPlayerStatus.Idle, resolve)
                );
                clearTimeout(stopper);
              } catch (err) {
                console.err("Replay failed:", err);
              }
            })();
            // Calls start timer to reset the time for the round
            startTimer();
            componentCollector.resetTimer({ time: 15000 });
            return;
          }

          // Handles the hint button logic only allowing the user to use it once
          if (i.customId === "trivia_hint") {
            if (hintUsed) {
              await i.reply({ content: "Hint already used this round.", ephemeral: true });
              return;
            }
            hintUsed = true;
            await i.deferUpdate();
            // question.type was added to the object returned by makeSongQuestion
            // so we can generate a hint that actually matches the form of the
            // current question rather than just guessing based on difficulty.
            const hint = makeHint(track, question.type);
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
          componentCollector.on("end", async () => {
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
            } catch (err) {console.err("Failed to highlight correct answer:", err);}

            //const ss = getSession(guild.id);
            const answerLine = `✅ **${track.trackName}** — **${track.artistName}**`;

            // If the round ended because someone got it correct  we give them points and congratulate them
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
            } catch (err) {
              console.err("Failed to cleanup temp file", err);
            }

            // old shorter delay removed (handled above)
            try { await listenMsg.delete().catch(() => {}); } catch (err) {
              console.err("Failed to delete listening message:", err);
            }
            resolve();
          });
        });
        // pause here until the round’s collector has finished firing its end handler
        await endPromise;
      }

      // flowchart: Answered 10 questions? -> end
      // Handles the end of the game logic by getting the final scores, 
      // displaying the final leaderboard, and cleaning up the session and connection
      const final = getGuildScoresSorted(guild.id);
      if (!final.length) {
        await tc.send("🏁 Game over! No points scored.");
      } else {
        const lines = final.slice(0, 10).map(([uid, pts], i) => `${i + 1}. <@${uid}> — **${pts}**`);
        await tc.send(`🏁 **Game over! Final scoreboard:**\n${lines.join("\n")}`);
      }
    } catch (err) {
      console.err("[trivia] CRASH:", err?.stack || err);
      try {
        await tc.send(`❌ Trivia crashed: \`${String(err?.message || err).slice(0, 180)}\``);
      } catch (err) {
        console.err("Failed to send crash message", err);
      }
    } finally {
      // cleanup
      try { connection?.destroy(); } catch (err) {console.err("Failed to destroy voice conneciton", err);}
      clearSession(guild.id);
    }
  },
};