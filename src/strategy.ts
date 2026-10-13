import type { Board, Move, Position, Tile } from "./model";
import { Lexicon, SearchDeadline, solve } from "./solver";

// Wordfeud official Danish distribution, reviewed 2026-10-13:
// https://wordfeud.com/wfweb/help/ (Danish). Blanks are physical ? tiles.
export const DANISH_COUNTS: Record<string, number> = {
  A: 7, B: 4, C: 2, D: 5, E: 9, F: 3, G: 3, H: 2, I: 4,
  J: 2, K: 4, L: 5, M: 3, N: 7, O: 5, P: 2, R: 7, S: 6,
  T: 6, U: 3, V: 3, X: 1, Y: 2, Z: 1, Æ: 2, Ø: 2, Å: 2, "?": 2,
};
export const STRATEGY_VERSION = 1;
export interface StrategicMove extends Move {
  strategy: {
    value: number;
    leave: string;
    rackQuality: number;
    exposure: number;
    opponentMean: number | null;
    nextMean: number | null;
    replyP90: number | null;
    samples: number;
  };
}
export interface Analysis {
  pointsMoves: Move[];
  strategyMoves: StrategicMove[];
  examined: number;
  rounds: number;
  method: "simulation" | "heuristic" | "unavailable";
  warning?: string;
}

export function moveKey(move: Move): string {
  return move.placed.slice().sort((a, b) => a.index - b.index)
    .map(p => `${p.index}:${p.letter}:${p.value}:${p.blank}`).join("|");
}

export function remainingRack(rack: Tile[], move: Move): Tile[] {
  const remaining = rack.slice();
  for (const placed of move.placed) {
    const index = remaining.findIndex(t => t.blank === placed.blank &&
      (t.blank || (t.letter === placed.letter && t.value === placed.value)));
    if (index < 0) throw new Error("Move does not match rack");
    remaining.splice(index, 1);
  }
  return remaining;
}

// Initial point-equivalent heuristic. Simulation supplies the board-specific
// evidence; these explicit weights are versioned, not a trained leave table.
export function rackQuality(rack: Tile[]): number {
  const counts = new Map<string, number>();
  let blanks = 0, vowels = 0, duplicates = 0;
  for (const t of rack) {
    if (t.blank) { blanks++; continue; }
    if ("AEIOUYÆØÅ".includes(t.letter)) vowels++;
    const count = counts.get(t.letter) ?? 0;
    if (count) duplicates++;
    counts.set(t.letter, count + 1);
  }
  const letters = rack.length - blanks;
  return blanks * 8 - duplicates * 2 - 1.5 * Math.abs(vowels - letters * 0.4);
}

export function unseenTiles(position: Position): Tile[] | null {
  const counts = { ...DANISH_COUNTS };
  for (const t of [...position.board.filter((t): t is Tile => !!t), ...position.rack]) {
    const letter = t.blank ? "?" : t.letter;
    if (!counts[letter]) return null;
    counts[letter]--;
  }
  return Object.entries(counts).flatMap(([letter, count]) =>
    Array.from({ length: count }, () => ({
      letter, value: letter === "?" ? 0 : position.rules.values[letter] ?? 1,
      blank: letter === "?",
    })));
}

export function applyMove(board: Board, move: Move): Board {
  const next = board.slice();
  for (const p of move.placed) next[p.index] = {
    letter: p.letter, value: p.blank ? 0 : p.value, blank: p.blank,
  };
  return next;
}

// Geometric screening only: premiums within seven straight-line empty squares
// of a new tile. Actual reply legality and scores are evaluated in rollouts.
export function premiumExposure(position: Position, move: Move): number {
  const board = applyMove(position.board, move), seen = new Map<number, number>();
  const weights = { "": 0, DL: 1, TL: 2, DW: 4, TW: 8 };
  for (const p of move.placed)
    for (const delta of [-15, 15, -1, 1])
      for (let distance = 1; distance <= 7; distance++) {
        const index = p.index + delta * distance;
        if (index < 0 || index >= 225 ||
          (Math.abs(delta) === 1 && Math.floor(index / 15) !== Math.floor(p.index / 15)) || board[index]) break;
        const risk = weights[position.bonuses[index]] / distance;
        seen.set(index, Math.max(seen.get(index) ?? 0, risk));
      }
  return [...seen.values()].reduce((sum, n) => sum + n, 0);
}

function collector(limit: number, evaluate: (move: Move) => number) {
  let entries: { move: Move; key: string; value: number }[] = [];
  return {
    add(move: Move) {
      const key = moveKey(move);
      if (entries.some(e => e.key === key)) return;
      const value = evaluate(move);
      if (entries.length === limit && value < entries[entries.length - 1].value) return;
      entries.push({ move, key, value });
      entries.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
      entries = entries.slice(0, limit);
    },
    moves: () => entries.map(e => e.move),
  };
}

export function initialAnalysis(position: Position, lexicon: Lexicon): Analysis {
  const equity = (m: Move) => m.score + rackQuality(remainingRack(position.rack, m));
  const quality = collector(12, equity);
  const defensive = collector(2, m => equity(m) - premiumExposure(position, m));
  const exact = solve(position, lexicon, 20, { onMove: m => { quality.add(m); defensive.add(m); } });
  if (!unseenTiles(position)) return {
    pointsMoves: exact.moves, strategyMoves: [], examined: exact.examined,
    rounds: 0, method: "unavailable",
    warning: "These tiles exceed the Danish Wordfeud distribution. Correct the board or rack to enable strategy; highest-score moves are still available.",
  };
  const unique = new Map<string, Move>();
  for (const m of [...exact.moves.slice(0, 5), ...quality.moves().slice(0, 5), ...defensive.moves(), ...quality.moves()]) {
    if (unique.size === 12) break;
    unique.set(moveKey(m), m);
  }
  const strategyMoves = [...unique.values()].map(m => {
    const remaining = remainingRack(position.rack, m), exposure = premiumExposure(position, m);
    const quality = rackQuality(remaining);
    return { ...m, strategy: {
      value: m.score + quality - 0.25 * exposure,
      leave: remaining.map(t => t.blank ? "?" : t.letter).join(""),
      rackQuality: quality, exposure, opponentMean: null, nextMean: null,
      replyP90: null, samples: 0,
    } };
  }).sort(compareStrategy);
  return { pointsMoves: exact.moves, strategyMoves, examined: exact.examined, rounds: 0, method: "heuristic" };
}

function compareStrategy(a: StrategicMove, b: StrategicMove): number {
  return b.strategy.value - a.strategy.value || b.score - a.score || moveKey(a).localeCompare(moveKey(b));
}

export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const c of seed) { state ^= c.charCodeAt(0); state = Math.imul(state, 16777619); }
  return () => {
    state += 0x6D2B79F5;
    let n = Math.imul(state ^ state >>> 15, state | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export function shuffleTiles(tiles: Tile[], random: () => number): Tile[] {
  const shuffled = tiles.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface Sample { equity: number; opponent: number; next: number }
const rackPoints = (rack: Tile[]) => rack.reduce((sum, t) => sum + (t.blank ? 0 : t.value), 0);

export function rollout(position: Position, move: Move, hidden: Tile[], lexicon: Lexicon, deadline: number): Sample {
  if (performance.now() >= deadline) throw new SearchDeadline();
  let opponentRack = hidden.slice(0, 7), bag = hidden.slice(7);
  let ownRack = remainingRack(position.rack, move), board = applyMove(position.board, move);
  const draw = (rack: Tile[], count: number) => {
    const taken = bag.splice(0, Math.min(count, bag.length));
    return [...rack, ...taken];
  };
  ownRack = draw(ownRack, move.placed.length);
  if (!bag.length && !ownRack.length)
    return { equity: move.score + 2 * rackPoints(opponentRack), opponent: 0, next: 0 };
  const choose = (rack: Tile[], otherRack: Tile[]) => solve({ ...position, board, rack }, lexicon, 1, {
    deadline, evaluate: m => {
      const remaining = remainingRack(rack, m);
      if (!bag.length) return m.score + (!remaining.length ? 2 * rackPoints(otherRack) : -rackPoints(remaining));
      return m.score + rackQuality(remaining);
    },
  }).moves[0];
  const reply = choose(opponentRack, ownRack);
  const opponent = reply?.score ?? 0;
  if (reply) {
    board = applyMove(board, reply);
    opponentRack = remainingRack(opponentRack, reply);
    if (!bag.length && !opponentRack.length)
      return { equity: move.score - opponent - 2 * rackPoints(ownRack), opponent, next: 0 };
    opponentRack = draw(opponentRack, reply.placed.length);
  }
  const nextMove = choose(ownRack, opponentRack), next = nextMove?.score ?? 0;
  if (nextMove) {
    ownRack = remainingRack(ownRack, nextMove);
    if (!bag.length && !ownRack.length)
      return { equity: move.score - opponent + next + 2 * rackPoints(opponentRack), opponent, next };
    ownRack = draw(ownRack, nextMove.placed.length);
  }
  return {
    equity: move.score - opponent + next + rackQuality(ownRack) - rackQuality(opponentRack),
    opponent, next,
  };
}

export function summarizeSamples(move: StrategicMove, samples: Sample[]): StrategicMove {
  if (!samples.length) return move;
  const mean = (field: keyof Sample) => samples.reduce((sum, s) => sum + s[field], 0) / samples.length;
  const replies = samples.map(s => s.opponent).sort((a, b) => a - b);
  const replyP90 = replies[Math.ceil(replies.length * 0.9) - 1];
  const opponentMean = mean("opponent");
  return { ...move, strategy: { ...move.strategy,
    value: mean("equity") - 0.25 * Math.max(0, replyP90 - opponentMean),
    opponentMean, nextMean: mean("next"), replyP90, samples: samples.length,
  } };
}

export async function analyzeStrategy(
  position: Position, lexicon: Lexicon, initial: Analysis,
  onUpdate: (analysis: Analysis) => void,
  options: { budgetMs?: number; maxRounds?: number; simulate?: typeof rollout } = {},
): Promise<Analysis> {
  const unseen = unseenTiles(position);
  if (!unseen || !initial.strategyMoves.length) return initial;
  const deadline = performance.now() + (options.budgetMs ?? 30_000);
  const random = seededRandom(JSON.stringify(position) + STRATEGY_VERSION);
  const candidates = initial.strategyMoves;
  const samples: Sample[][] = candidates.map(() => []);
  let result = initial, lastUpdate = performance.now();
  for (let round = 0; round < (options.maxRounds ?? 256); round++) {
    const hidden = shuffleTiles(unseen, random), completed: Sample[] = [];
    try {
      for (const candidate of candidates) {
        if (performance.now() >= deadline) throw new SearchDeadline();
        completed.push((options.simulate ?? rollout)(position, candidate, hidden, lexicon, deadline));
      }
      if (performance.now() >= deadline) break;
    } catch (error) {
      if (error instanceof SearchDeadline) break;
      throw error;
    }
    // Commit only complete rounds: every candidate sees exactly the same worlds.
    completed.forEach((sample, i) => samples[i].push(sample));
    result = { ...initial, rounds: round + 1, method: "simulation",
      strategyMoves: candidates.map((move, i) => summarizeSamples(move, samples[i])).sort(compareStrategy),
    };
    if (performance.now() - lastUpdate >= 750) {
      onUpdate(result); lastUpdate = performance.now();
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return result;
}
