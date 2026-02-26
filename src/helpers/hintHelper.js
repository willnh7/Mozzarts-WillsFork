// Simple hint generator for music trivia tracks.
// Previous versions had a more elaborate stage-based system; here we
// just offer one hint per round, based on artist or title.

// `type` corresponds to the kind of question that was asked.  The
// old implementation ignored both the difficulty and stage parameters and
// always returned the same hint; this could be misleading when the question
// was asking for a release year or album name.  Rather than guess based on
// difficulty we now accept an explicit `type` so the caller can provide the
// exact field that was used in the question.  The third argument is kept for
// backwards compatibility (tests, etc.) but we prefer the caller to pass
// the type string directly.
export function makeHint(track, type = "artist", difficulty = "easy") {
  // tracks coming from the iTunes API may lack some fields so we default to
  // "unknown" to avoid runtime errors.
  const artist = track.artistName || "unknown";
  const title = track.trackName || "unknown";
  const album = track.collectionName || "unknown";
  const genre = track.primaryGenreName || "unknown";

  // helper to get year safely
  const getYear = () => {
    try {
      const d = new Date(track.releaseDate);
      return Number.isFinite(d.getFullYear()) ? String(d.getFullYear()) : "unknown";
    } catch {
      return "unknown";
    }
  };

  switch (type) {
    case "artist":
      return `Artist starts with **${artist.charAt(0).toUpperCase()}**`;
    case "genre":
      return `Genre starts with **${genre.charAt(0).toUpperCase()}**`;
    case "album":
      return `Album starts with **${album.charAt(0).toUpperCase()}**`;
    case "title":
      return `Title starts with **${title.charAt(0).toUpperCase()}**`;
    case "year": {
      const year = getYear();
      if (year !== "unknown") {
        // give first digit(s) so it's still somewhat of a clue
        return `Year of release starts with **${year.charAt(0)}**`;
      }
      return `Year of release is **unknown**`;
    }
    default:
      // fall back to original implementation if caller passes something
      // unexpected; this should only happen during tests or if we forgot
      // to update a call site.
      const artistChar = artist.charAt(0).toUpperCase();
      const titleChar = title.charAt(0).toUpperCase();
      return `Artist starts with **${artistChar}**, title starts with **${titleChar}**`;
  }
}
