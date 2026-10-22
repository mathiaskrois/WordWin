import type { Position } from "./model";

export const ACTIVITY_API = (import.meta.env.VITE_ACTIVITY_API_URL || `${import.meta.env.BASE_URL}api`).replace(/\/$/, "");
export const BOARD_EMAIL_URL = import.meta.env.VITE_BOARD_EMAIL_URL || "";
export const EMAIL_NOTIFICATIONS = !!BOARD_EMAIL_URL;
export const ACTIVITY_STORE = EMAIL_NOTIFICATIONS ? "wordwin-board-email-v1" : "wordwin-activity-v1";
export interface ActivityEvent {
  id: string;
  userId: string;
  sessionId: string;
  at: string;
  kind: "open" | "resume" | "board_import" | "board_rescan" | "import_failed" | "solve";
  position?: Position;
}
interface ActivityState { userId: string; pending: ActivityEvent[] }
let sessionId: string;
let flushing = false;
let started = false;
let memory: ActivityState | undefined;
function refreshState() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVITY_STORE) || "null");
    if (saved && typeof saved.userId === "string" && Array.isArray(saved.pending)) {
      memory = saved;
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
  memory ||= { userId: crypto.randomUUID(), pending: [] };
}
function state(): ActivityState {
  if (!memory) refreshState();
  return memory!;
}
function save() {
  try { localStorage.setItem(ACTIVITY_STORE, JSON.stringify(state())); } catch { /* Logging must not block play. */ }
}
export function recordActivity(kind: ActivityEvent["kind"], position?: Position) {
  if (EMAIL_NOTIFICATIONS && kind !== "board_import") return;
  try {
    refreshState();
    const data = state();
    sessionId ||= crypto.randomUUID();
    const event: ActivityEvent = {
      id: crypto.randomUUID(), userId: data.userId, sessionId,
      at: new Date().toISOString(), kind,
    };
    // Explicit projection: never accept a File, image URL, canvas or screenshot metadata.
    if (position) event.position = {
      board: position.board.map(t => t ? { letter: t.letter, value: t.value, blank: t.blank } : null),
      rack: position.rack.map(t => ({ letter: t.letter, value: t.value, blank: t.blank })),
      bonuses: [...position.bonuses],
      rules: { values: { ...position.rules.values }, bingo: position.rules.bingo, center: position.rules.center },
    };
    data.pending = [...data.pending, event].slice(-250);
    save();
    void flushActivity();
  } catch { /* Usage collection must never interrupt the app. */ }
}
export async function flushActivity() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    while (state().pending.length) {
      const events = state().pending.slice(0, EMAIL_NOTIFICATIONS ? 1 : 5);
      if (EMAIL_NOTIFICATIONS && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(BOARD_EMAIL_URL)) break;
      const response = EMAIL_NOTIFICATIONS
        ? await fetch(BOARD_EMAIL_URL, {
            method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: JSON.stringify(events[0]), credentials: "omit", signal: AbortSignal.timeout(15000),
          })
        : await fetch(`${ACTIVITY_API}/events`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ events }), credentials: "omit", signal: AbortSignal.timeout(10000),
          });
      // Google Apps Script responses can be opaque across origins. This confirms dispatch,
      // not email delivery; quota errors and server errors cannot be inspected in that mode.
      if (!response.ok && !(EMAIL_NOTIFICATIONS && response.type === "opaque")) break;
      refreshState();
      const ids = new Set(events.map(e => e.id));
      state().pending = state().pending.filter(e => !ids.has(e.id));
      save();
    }
  } catch { /* Retry next time the app opens, resumes, or reconnects. */ }
  finally { flushing = false; }
}
export function startActivity() {
  if (started) return;
  started = true;
  recordActivity("open");
  void flushActivity();
  window.addEventListener("online", () => void flushActivity());
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else {
      if (hiddenAt && Date.now() - hiddenAt > 60000) recordActivity("resume");
      void flushActivity();
      hiddenAt = 0;
    }
  });
}
