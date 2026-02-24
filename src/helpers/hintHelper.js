// src/helpers/hintHelper.js

export function getHint(input) {
  if (!input) return "Try a shorter title or a more common song name.";

  const cleaned = String(input).trim();
  if (cleaned.length <= 2) return "That title is very short—try a longer one.";

  // Basic example hint: hide most characters
  // Replace this later with your iTunes logic
  const visible = Math.min(2, cleaned.length);
  const masked =
    cleaned.slice(0, visible) + "•".repeat(Math.max(0, cleaned.length - visible));

  return `Starts with: ${masked}`;
}