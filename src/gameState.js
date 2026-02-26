export const activeSessions = new Map(); // guildId -> session
export const guildPrefs = new Map(); // guildId -> { genre }

export function getGenre(guildId) {
  return guildPrefs.get(guildId)?.genre ?? "random";
}

export function setGenre(guildId, genre) {
  guildPrefs.set(guildId, { genre });
}

export function getSession(guildId) {
  return activeSessions.get(guildId) ?? null;
}

export function setSession(guildId, session) {
  activeSessions.set(guildId, session);
}

export function clearSession(guildId) {
  activeSessions.delete(guildId);
}

/**
 * Mark an existing session as terminated by an administrator.  The
 * game loop in `trivia.js` watches the `active` flag and will stop as soon
 * as it sees the session become inactive; the `terminated` flag is used to
 * distinguish an orderly shutdown from a natural game end so that we can
 * surface a different ending message.
 */
export function terminateSession(guildId) {
  const s = activeSessions.get(guildId);
  if (s) {
    s.active = false;
    s.terminated = true;
    activeSessions.set(guildId, s);
  }
}

