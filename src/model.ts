export type Language = "en" | "da" | "both";
export type Bonus = "" | "DL" | "TL" | "DW" | "TW";
export interface Tile {
  letter: string;
  value: number;
  blank: boolean;
}
export type Board = (Tile | null)[];
export interface Rules {
  values: Record<string, number>;
  bingo: number;
  center: Bonus;
}
export interface Position {
  board: Board;
  bonuses: Bonus[];
  rack: Tile[];
  rules: Rules;
}
export interface Placement {
  index: number;
  letter: string;
  value: number;
  blank: boolean;
}
export interface ScoredWord {
  word: string;
  points: number;
  language?: Language;
}
export interface Move {
  word: string;
  row: number;
  col: number;
  direction: "across" | "down";
  score: number;
  placed: Placement[];
  words: ScoredWord[];
  bingo: number;
}
export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ";
export const DA_VALUES: Record<string, number> = Object.fromEntries(
  [...ALPHABET].map((c, i) => [
    c,
    [
      1, 3, 8, 2, 1, 3, 3, 4, 3, 4, 3, 2, 3, 1, 2, 4, 10, 1, 2, 2, 3, 4, 4, 8,
      4, 10, 4, 4, 4,
    ][i],
  ]),
);
export const EN_VALUES: Record<string, number> = Object.fromEntries(
  [...ALPHABET].map((c, i) => [
    c,
    [
      1, 4, 4, 2, 1, 4, 3, 4, 1, 10, 5, 1, 4, 1, 1, 4, 10, 1, 1, 1, 2, 4, 4, 8,
      4, 10, 4, 4, 4,
    ][i],
  ]),
);
export const emptyBoard = (): Board => Array(225).fill(null);
export function tile(letter: string, values = DA_VALUES, blank = false): Tile {
  return {
    letter: letter.toUpperCase(),
    blank,
    value: blank ? 0 : (values[letter.toUpperCase()] ?? 1),
  };
}
export function rackFromText(text: string, values = DA_VALUES): Tile[] {
  return [...text.toUpperCase().normalize("NFC")]
    .filter((c) => ALPHABET.includes(c) || c === "?")
    .slice(0, 7)
    .map((c) => tile(c, values, c === "?"));
}
export function normalizeWords(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((w) => w.trim().normalize("NFC").toUpperCase())
        .filter((w) => /^[A-ZÆØÅ]{2,15}$/.test(w)),
    ),
  ];
}
function mapFromQuarter(rows: string[]): Bonus[] {
  const tokens: Record<string, Bonus> = {
    ".": "",
    d: "DL",
    t: "TL",
    D: "DW",
    T: "TW",
  };
  return Array.from(
    { length: 225 },
    (_, i) =>
      tokens[
        rows[Math.min(Math.floor(i / 15), 14 - Math.floor(i / 15))][
          Math.min(i % 15, 14 - (i % 15))
        ]
      ],
  );
}
export const CLASSIC = mapFromQuarter([
  "T......T",
  ".t..D...",
  "..d..D..",
  "...t..d.",
  ".D..d..t",
  "..D...d.",
  "...d.d..",
  "T...t..D",
]);
export const ALTERNATE = mapFromQuarter([
  ".D...d..",
  "D..d...T",
  "..T..d..",
  ".d..D...",
  "...D..t.",
  "d.d.....",
  "....t.t.",
  ".T......",
]);
export function bonusesFor(
  layout: "classic" | "alternate",
  center?: Bonus,
): Bonus[] {
  const b = [...(layout === "classic" ? CLASSIC : ALTERNATE)];
  b[112] = center ?? (layout === "classic" ? "DW" : "");
  return b;
}
export function initialPosition(
  layout: "classic" | "alternate" = "classic",
): Position {
  const center = layout === "classic" ? "DW" : "";
  return {
    board: emptyBoard(),
    bonuses: bonusesFor(layout),
    rack: [],
    rules: { values: { ...DA_VALUES }, bingo: 40, center },
  };
}
