import {
  ALPHABET,
  type Board,
  type Move,
  type Placement,
  type Position,
  type ScoredWord,
} from "./model";
export class Lexicon {
  root = 0;
  first: Uint32Array;
  next: Uint32Array;
  letters: Uint8Array;
  terminal: Uint8Array;
  constructor(input: Iterable<string>) {
    const words = Array.from(input)
      .filter((w) => /^[A-ZÆØÅ]{2,15}$/.test(w))
      .sort();
    let count = 1,
      previous = "";
    for (const word of words) {
      let shared = 0;
      while (
        shared < word.length &&
        shared < previous.length &&
        word[shared] === previous[shared]
      )
        shared++;
      count += word.length - shared;
      previous = word;
    }
    this.first = new Uint32Array(count);
    this.next = new Uint32Array(count);
    this.letters = new Uint8Array(count);
    this.terminal = new Uint8Array(count);
    const tail = new Uint32Array(count);
    const stack = [0];
    let cursor = 1;
    previous = "";
    for (const word of words) {
      let shared = 0;
      while (
        shared < word.length &&
        shared < previous.length &&
        word[shared] === previous[shared]
      )
        shared++;
      stack.length = shared + 1;
      for (let i = shared; i < word.length; i++) {
        const parent = stack[i],
          node = cursor++;
        this.letters[node] = ALPHABET.indexOf(word[i]);
        if (tail[parent]) this.next[tail[parent]] = node;
        else this.first[parent] = node;
        tail[parent] = node;
        stack.push(node);
      }
      this.terminal[stack[word.length]] = 1;
      previous = word;
    }
  }
  child(node: number, letter: string): number {
    const code = ALPHABET.indexOf(letter);
    for (let n = this.first[node]; n; n = this.next[n])
      if (this.letters[n] === code) return n;
    return 0;
  }
  *children(node: number): Generator<[string, number]> {
    for (let n = this.first[node]; n; n = this.next[n])
      yield [ALPHABET[this.letters[n]], n];
  }
  has(word: string) {
    let node = 0;
    for (const letter of word) {
      node = this.child(node, letter);
      if (!node) return false;
    }
    return !!this.terminal[node];
  }
}
function line(
  index: number,
  delta: number,
  board: Board,
): { text: string; indices: number[] } {
  const indices = [index];
  let p = index;
  while (true) {
    const q = p - delta;
    if (
      q < 0 ||
      (delta === 1 && Math.floor(q / 15) !== Math.floor(p / 15)) ||
      !board[q]
    )
      break;
    indices.unshift(q);
    p = q;
  }
  p = index;
  while (true) {
    const q = p + delta;
    if (
      q >= 225 ||
      (delta === 1 && Math.floor(q / 15) !== Math.floor(p / 15)) ||
      !board[q]
    )
      break;
    indices.push(q);
    p = q;
  }
  return { text: indices.map((i) => board[i]?.letter ?? "").join(""), indices };
}
export function scoreMove(
  position: Position,
  placed: Placement[],
  direction: "across" | "down",
  lexicon: Lexicon,
): Move | null {
  if (
    !placed.length ||
    new Set(placed.map((p) => p.index)).size !== placed.length
  )
    return null;
  const board = position.board.slice();
  const delta = direction === "across" ? 1 : 15;
  const sameLine = placed.every((p) =>
    direction === "across"
      ? Math.floor(p.index / 15) === Math.floor(placed[0].index / 15)
      : p.index % 15 === placed[0].index % 15,
  );
  if (
    !sameLine ||
    placed.some((p) => p.index < 0 || p.index >= 225 || board[p.index])
  )
    return null;
  for (const p of placed)
    board[p.index] = {
      letter: p.letter,
      value: p.blank ? 0 : p.value,
      blank: p.blank,
    };
  const main = line(placed[0].index, delta, board);
  if (!placed.every((p) => main.indices.includes(p.index))) return null;
  const wasEmpty = !position.board.some(Boolean);
  if (
    wasEmpty
      ? !main.indices.includes(112)
      : !placed.some((p) =>
          [
            p.index - 15,
            p.index + 15,
            ...(p.index % 15 > 0 ? [p.index - 1] : []),
            ...(p.index % 15 < 14 ? [p.index + 1] : []),
          ].some((i) => i >= 0 && i < 225 && position.board[i]),
        )
  )
    return null;
  const used = new Set(placed.map((p) => p.index));
  const wordLines = [
    main,
    ...placed.map((p) => line(p.index, delta === 1 ? 15 : 1, board)),
  ].filter((l) => l.indices.length >= 2);
  if (!wordLines.length || wordLines.some((l) => !lexicon.has(l.text)))
    return null;
  const words: ScoredWord[] = wordLines.map((l) => {
    let points = 0,
      multiplier = 1;
    for (const i of l.indices) {
      const b = used.has(i) ? position.bonuses[i] : "";
      points += board[i]!.value * (b === "DL" ? 2 : b === "TL" ? 3 : 1);
      if (b === "DW") multiplier *= 2;
      if (b === "TW") multiplier *= 3;
    }
    return { word: l.text, points: points * multiplier };
  });
  const bingo = placed.length === 7 ? position.rules.bingo : 0;
  // Single-tile moves may form only a perpendicular word.
  const display = main.indices.length >= 2 ? main : wordLines[0];
  const actualDirection =
    main.indices.length >= 2
      ? direction
      : direction === "across"
        ? "down"
        : "across";
  return {
    word: display.text,
    row: Math.floor(display.indices[0] / 15),
    col: display.indices[0] % 15,
    direction: actualDirection,
    placed: placed.map((p) => ({ ...p })),
    words,
    bingo,
    score: words.reduce((s, w) => s + w.points, 0) + bingo,
  };
}
export function solve(
  position: Position,
  lexicon: Lexicon,
  limit = 20,
): { moves: Move[]; examined: number } {
  if (!position.rack.length) return { moves: [], examined: 0 };
  const empty = !position.board.some(Boolean);
  const anchors = new Set<number>();
  if (empty) anchors.add(112);
  else
    for (let i = 0; i < 225; i++)
      if (
        !position.board[i] &&
        [
          i - 15,
          i + 15,
          ...(i % 15 > 0 ? [i - 1] : []),
          ...(i % 15 < 14 ? [i + 1] : []),
        ].some((j) => j >= 0 && j < 225 && position.board[j])
      )
        anchors.add(i);
  const results = new Map<string, Move>();
  let examined = 0;
  for (const direction of ["across", "down"] as const) {
    const delta = direction === "across" ? 1 : 15;
    const cross = new Map<number, Set<string> | null>();
    for (let i = 0; i < 225; i++)
      if (!position.board[i]) {
        const opposite = delta === 1 ? 15 : 1;
        const ghost = position.board.slice();
        ghost[i] = { letter: "?", value: 0, blank: true };
        const l = line(i, opposite, ghost);
        cross.set(
          i,
          l.indices.length === 1
            ? null
            : new Set(
                [...ALPHABET].filter((c) =>
                  lexicon.has(l.text.replace("?", c)),
                ),
              ),
        );
      }
    for (let fixed = 0; fixed < 15; fixed++)
      for (let start = 0; start < 15; start++) {
        const startIndex =
          direction === "across" ? fixed * 15 + start : start * 15 + fixed;
        if (start > 0 && position.board[startIndex - delta]) continue;
        const placed: Placement[] = [];
        const available = position.rack.map((t) => ({ ...t }));
        const consumed = Array(available.length).fill(false);
        function walk(offset: number, node: number, connected: boolean) {
          const idx = startIndex + offset * delta;
          if (
            lexicon.terminal[node] &&
            placed.length &&
            connected &&
            (start + offset === 15 || !position.board[idx])
          ) {
            examined++;
            const move = scoreMove(position, placed, direction, lexicon);
            if (move) {
              const key = move.placed
                .slice()
                .sort((a, b) => a.index - b.index)
                .map((p) => `${p.index}:${p.letter}:${p.value}:${p.blank}`)
                .join("|");
              results.set(key, move);
              if (results.size > limit * 3) {
                const sorted = [...results.entries()].sort(
                  (a, b) => b[1].score - a[1].score,
                );
                for (const [k] of sorted.slice(limit)) results.delete(k);
              }
            }
          }
          if (start + offset >= 15) return;
          const existing = position.board[idx];
          if (existing) {
            const child = lexicon.child(node, existing.letter);
            if (child) walk(offset + 1, child, connected);
            return;
          }
          // A move must reach an anchor before its seven rack tiles are exhausted.
          if (!connected) {
            let reachable = false,
              needed = 0;
            for (let k = offset; start + k < 15; k++) {
              const j = startIndex + k * delta;
              if (!position.board[j]) needed++;
              if (needed > available.length - placed.length) break;
              if (anchors.has(j)) {
                reachable = true;
                break;
              }
            }
            if (!reachable) return;
          }
          const allowed = cross.get(idx);
          const duplicates = new Set<string>();
          for (let r = 0; r < available.length; r++) {
            if (consumed[r]) continue;
            const t = available[r];
            const signature = `${t.letter}:${t.value}:${t.blank}`;
            if (duplicates.has(signature)) continue;
            duplicates.add(signature);
            for (const [letter, child] of lexicon.children(node)) {
              if (!t.blank && t.letter !== letter) continue;
              if (allowed && !allowed.has(letter)) continue;
              consumed[r] = true;
              placed.push({
                index: idx,
                letter,
                value: t.blank ? 0 : t.value,
                blank: t.blank,
              });
              walk(offset + 1, child, connected || anchors.has(idx));
              placed.pop();
              consumed[r] = false;
            }
          }
        }
        walk(0, lexicon.root, false);
      }
  }
  const moves = [...results.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.word.localeCompare(b.word) ||
        a.row - b.row ||
        a.col - b.col ||
        a.direction.localeCompare(b.direction),
    )
    .slice(0, limit);
  return { moves, examined };
}
