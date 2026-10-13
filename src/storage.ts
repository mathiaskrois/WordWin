import type { Position } from "./model";
import { initialPosition } from "./model";
export const STORE = "wordwin-v1";
export interface Saved {
  position: Position;
  layout: "classic" | "alternate";
  profile: "da" | "en";
  resultsTab: "strategy" | "points";
}
export function load(): Saved {
  const fallback: Saved = {
    position: initialPosition(),
    layout: "classic",
    profile: "da",
    resultsTab: "strategy",
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
      return { position: data.position, layout: data.layout === "alternate" ? "alternate" : "classic", profile: data.profile === "en" ? "en" : "da", resultsTab: data.resultsTab === "points" ? "points" : "strategy" };
  } catch {}
  return fallback;
}
