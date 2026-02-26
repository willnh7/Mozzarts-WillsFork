const roundsPlayed = new Map(); // guildId -> Map(userId -> rounds played)
const roundsWon = new Map(); // guildId -> Map(userId -> rounds won)
const gamesPlayed = new Map(); // guildId -> Map(userId -> games played)
const gamesWon = new Map(); // guildId -> Map(userId -> games won)

// Functions to increase the stats for one user
export function addRoundPlayed(guildId, userId) {
  if (!roundsPlayed.has(guildId)) roundsPlayed.set(guildId, new Map());
  const g = roundsPlayed.get(guildId);
  g.set(userId, (g.get(userId) ?? 0) + 1);
}

export function addRoundWon(guildId, userId) {
  if (!roundsWon.has(guildId)) roundsWon.set(guildId, new Map());
  const g = roundsWon.get(guildId);
  g.set(userId, (g.get(userId) ?? 0) + 1);
}

export function addGamePlayed(guildId, userId) {
  if (!gamesPlayed.has(guildId)) gamesPlayed.set(guildId, new Map());
  const g = gamesPlayed.get(guildId);
  g.set(userId, (g.get(userId) ?? 0) + 1);
}

export function addGameWon(guildId, userId) {
  if (!gamesWon.has(guildId)) gamesWon.set(guildId, new Map());
  const g = gamesWon.get(guildId);
  g.set(userId, (g.get(userId) ?? 0) + 1);
}

// Functions to get the stats for one user
export function getRoundsPlayed(guildId, userId) {
  return roundsPlayed.get(guildId)?.get(userId) ?? 0;
}

export function getRoundsWon(guildId, userId) {
  return roundsWon.get(guildId)?.get(userId) ?? 0;
}

export function getGamesPlayed(guildId, userId) {
  return gamesPlayed.get(guildId)?.get(userId) ?? 0;
}

export function getGamesWon(guildId, userId) {
  return gamesWon.get(guildId)?.get(userId) ?? 0;
}