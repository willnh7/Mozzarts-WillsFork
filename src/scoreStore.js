// src/scoreStore.js
const scores = new Map();

export function get(userId) {
  return scores.get(userId) ?? 0;
}

export function set(userId, value) {
  scores.set(userId, Number(value) || 0);
}

export function add(userId, delta) {
  const next = (scores.get(userId) ?? 0) + (Number(delta) || 0);
  scores.set(userId, next);
  return next;
}

export function reset(userId) {
  scores.delete(userId);
}

export function _clearAllForTests() {
  scores.clear();
}