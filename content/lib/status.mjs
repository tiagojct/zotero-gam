// The look of a note status. Pure module: no Zotero or browser globals.

/**
 * The tone of a status, for its colour: "todo" (to-read), "active" (reading), "done" (read) or
 * "none" (no status, or one that gam does not know).
 */
export function statusTone(status) {
  const s = String(status ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (["to-read", "toread", "unread", "inbox", "queued", "todo", "to-do"].includes(s)) return "todo";
  if (["reading", "in-progress", "started", "skimming"].includes(s)) return "active";
  if (["read", "done", "finished", "processed", "complete", "completed"].includes(s)) return "done";
  return "none";
}

/** The colour of each tone: one value for a light theme and one for a dark theme. */
export const TONE_COLORS = {
  todo: ["#2f6fdb", "#6aa3ff"],
  active: ["#b97800", "#f0b84a"],
  done: ["#23865a", "#4fd09a"],
  none: ["#7b818c", "#9aa0aa"],
};
