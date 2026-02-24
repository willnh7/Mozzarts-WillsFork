// Simple hint generator for music trivia tracks.
// Previous versions had a more elaborate stage-based system; here we
// just offer one hint per round, based on artist or title.

export function makeHint(track, stage = 1, difficulty = "easy") {
  // track is an iTunes metadata object
  const artist = track.artistName || "unknown";
  const title = track.trackName || "unknown";

  // for now, always show first letter of the artist and title
  // stage parameter is ignored since we only allow one hint
  const artistChar = artist.charAt(0).toUpperCase();
  const titleChar = title.charAt(0).toUpperCase();

  return `Artist starts with **${artistChar}**, title starts with **${titleChar}**`;
}
