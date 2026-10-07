import type { Position, Language } from "./model";
import { initialPosition } from "./model";
export const STORE = "wordwin-v1";
export interface Saved {
  position: Position;
  language: Language;
  layout: "classic" | "alternate";
  profile: "da" | "en";
}
export function load(): Saved {
  const fallback: Saved = {
    position: initialPosition(),
    language: "da",
    layout: "classic",
    profile: "da",
  };
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || "null");
    if (
      data &&
      Array.isArray(data.position?.board) &&
      data.position.board.length === 225 &&
      Array.isArray(data.position.bonuses) &&
      data.position.bonuses.length === 225 &&
      Array.isArray(data.position.rack) &&
      data.position.rack.length <= 7 &&
      data.position.rules?.values
    )
      return data;
  } catch {}
  return fallback;
}
let dbPromise: Promise<IDBDatabase> | undefined;
function db() {
  return (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("wordwin-dictionaries", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("words");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function readCustom(): Promise<
  Partial<Record<"en" | "da", string>>
> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("words");
    const out: Partial<Record<"en" | "da", string>> = {};
    for (const language of ["en", "da"] as const) {
      const r = tx.objectStore("words").get(language);
      r.onsuccess = () => {
        if (typeof r.result === "string") out[language] = r.result;
      };
    }
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  });
}
export async function saveCustom(language: "en" | "da", text?: string) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction("words", "readwrite");
    if (text === undefined) tx.objectStore("words").delete(language);
    else tx.objectStore("words").put(text, language);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
