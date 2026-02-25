// Helper for creating trivia question embeds and buttons [VERSION .01]

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getRandomQuestion } from "../data/triviaQuestions.js";
import { getRandomItunesTrack } from "./itunes.js";

// lightweight utility
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Creates a trivia question embeds and buttons
 * @param {object} question - The trivia question object
 * @returns {object} Object containing embed and actionRow
 */
export function createTriviaQuestion(question) {
  const embed = new EmbedBuilder()
    .setColor(0x1db954) // Spotify green
    .setTitle("🎵 Music Trivia Question")
    .setDescription(question.question)
    .addFields(
      {
        name: "Difficulty",
        value: `${question.difficulty.toUpperCase()} (${question.points} point${question.points > 1 ? "s" : ""})`,
        inline: true,
      }
    )
    .setFooter({ text: "Click the button with the correct answer!" });

  // Create buttons for each answer option.  Use the option index in the
  // customId rather than the full text to avoid length limits and encoding
  // problems; the handler will look up the answer in the question object.
  const buttons = question.options.map((option, idx) => {
    return new ButtonBuilder()
      .setCustomId(`trivia_answer_${idx}`)
      .setLabel(option)
      .setStyle(ButtonStyle.Primary);
  });

  // Create action row with buttons (Discord allows max 5 buttons per row)
  const actionRow = new ActionRowBuilder().addComponents(buttons);

  return { embed, actionRow };
}

/**
 * Create a result embed based on user's answer
 * @param {object} question - The trivia question object
 * @param {string} userAnswer - The user's selected answer
 * @param {object} user - The user who answered
 * @returns {object} Result embed
 */
export function createResultEmbed(question, userAnswer, user) {
  const isCorrect = userAnswer === question.correctAnswer;

  const embed = new EmbedBuilder()
    .setTitle(isCorrect ? "✅ Correct!" : "❌ Wrong!")
    .setColor(isCorrect ? 0x00ff00 : 0xff0000)
    .setDescription(
      `**Question:** ${question.question}\n\n**Correct Answer:** ${question.correctAnswer}\n**Your Answer:** ${userAnswer}`
    )
    .addFields({
      name: "Points Earned",
      value: isCorrect ? `+${question.points} points` : "+0 points",
      inline: true,
    })
    .setFooter({ text: `Answered by ${user.username}` });

  return embed;
}

/**
 * Gets a random trivia question
 * @param {string} difficulty - Optional: 'easy', 'medium', or 'hard'
 * @returns {object} Question object
 */
export function getTriviaQuestion(difficulty = null) {
  return getRandomQuestion(difficulty);
}

/**
 * Build a multiple‑choice question for a specific iTunes track.  The question
 * text is chosen randomly from a set of templates (album/artist/genre/year)
 * and the wrong answers are pulled from other tracks fetched via the iTunes
 * API.  This is how we guarantee that every question is tied to the currently
 * playing song.
 *
 * @param {object} track - track metadata returned by getRandomItunesTrack
 * @param {string} difficulty - 'easy'|'medium'|'hard' (affects scoring and
 *                              which question types are allowed)
 * @returns {Promise<object>} problem object with fields suitable for
 *                            createTriviaQuestion()
 */
export async function makeSongQuestion(track, difficulty = "easy", otherTrackProvider = getRandomItunesTrack) {
  const TYPES = [
    { id: "artist", label: "Who is the artist of this song?", getter: (t) => t.artistName },
    { id: "album", label: "Which album is this song from?", getter: (t) => t.collectionName },
    { id: "genre", label: "What genre does this song belong to?", getter: (t) => t.primaryGenreName },
    {
      id: "year",
      label: "In what year was this song released?",
      getter: (t) => {
        try {
          const d = new Date(t.releaseDate);
          return Number.isFinite(d.getFullYear()) ? String(d.getFullYear()) : null;
        } catch {
          return null;
        }
      },
    },
    { id: "title", label: "What is the name of this song?", getter: (t) => t.trackName },
  ];

  // restrict question pool by difficulty: easy gets simpler metadata, medium
  // targets album/title, hard goes for year (the toughest to know).
  let available;
  if (difficulty === "easy") {
    available = TYPES.filter((t) => ["artist", "genre"].includes(t.id));
  } else if (difficulty === "medium") {
    available = TYPES.filter((t) => ["album", "title"].includes(t.id));
  } else {
    available = TYPES.filter((t) => ["year"].includes(t.id));
  }
  // if filtering somehow removed everything, fall back to all types
  if (!available.length) available = TYPES.slice();

  // pick a type that actually has a valid value in the track
  let choice;
  let correct;
  while (available.length) {
    choice = pick(available);
    correct = choice.getter(track);
    if (correct && correct !== "") break;
    available = available.filter((t) => t !== choice);
  }

  if (!correct) {
    // last‑ditch fallback to track name itself
    choice = { id: "title", label: "What is the name of this song?", getter: (t) => t.trackName };
    correct = choice.getter(track) || "Unknown";
  }

  // gather up to three wrong answers from other tracks.  the provider may
  // return duplicates (e.g. during testing) so we cap the number of attempts
  // to avoid getting stuck.
  const wrongs = new Set();
  const genre = track.primaryGenreName || null;
  let attempts = 0;
  while (wrongs.size < 3 && attempts < 30) {
    attempts += 1;
    try {
      const other = await otherTrackProvider(genre);
      const val = choice.getter(other);
      if (val && val !== correct) {
        wrongs.add(val);
      }
    } catch {
      // ignore failed calls
    }
  }

  // if we still don't have enough distractors, pad with generic fillers
  const fillers = ["Unknown", "N/A", "Other"];
  for (let i = wrongs.size; i < 3; i++) wrongs.add(fillers[i] || `Choice ${i + 1}`);

  const options = [correct, ...Array.from(wrongs)];
  // shuffle
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return {
    difficulty,
    points: difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3,
    question: choice.label,
    correctAnswer: correct,
    options,
  };
}
