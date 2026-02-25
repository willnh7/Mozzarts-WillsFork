const store = new Map(); // guildId -> Map(userId -> points)
const allTimeStore = new Map(); // guildId -> Map(userId -> points)

// Resets score but not all time score
export function resetScores(guildId) {
  store.set(guildId, new Map());
}

export function addPoints(guildId, userId, points) {
  // Get the submaps for this guild
  if (!store.has(guildId)) store.set(guildId, new Map());
  const g = store.get(guildId);
  if (!allTimeStore.has(guildId)) allTimeStore.set(guildId, new Map());
  const allTimeG = allTimeStore.get(guildId);

  // Calculate the new totals and put them into both maps
  g.set(userId, (g.get(userId) ?? 0) + points);
  allTimeG.set(userId, (allTimeG.get(userId) ?? 0) + points);
}

// Get points of user in current game
export function getUserPoints(guildId, userId) {
  return store.get(guildId)?.get(userId) ?? 0;
}

// Get points of user from all time
export function getUserAllTimePoints(guildId, userId) {
  return allTimeStore.get(guildId)?.get(userId) ?? 0;
}

export function getGuildScoresSorted(guildId) {
  const g = store.get(guildId) ?? new Map();
  return [...g.entries()].sort((a, b) => b[1] - a[1]); // [userId, points]
}

export function getTotalScore(guildId) {
  const g = store.get(guildId) ?? new Map();
  let total = 0;
  for (const v of g.values()) total += v;
  return total;
}