import { describe, expect, it } from "vitest";
import { initialPosition, rackFromText, tile, type Position } from "../../src/model";
import { Lexicon, scoreMove, SearchDeadline, solve } from "../../src/solver";
import {
  analyzeStrategy, applyMove, DANISH_COUNTS, initialAnalysis, moveKey,
  premiumExposure, rackQuality, remainingRack, rollout, seededRandom,
  shuffleTiles, summarizeSamples, unseenTiles,
} from "../../src/strategy";

const lexicon = new Lexicon(["AT", "TA", "ATE", "TE", "ET", "ÆG", "ÅL"]);
function fixture(): Position {
  const p = initialPosition(); p.rack = rackFromText("ATE"); return p;
}

describe("strategic analysis", () => {
  it("uses the 104-tile Danish distribution and counts assigned board blanks physically", () => {
    expect(Object.values(DANISH_COUNTS).reduce((s, n) => s + n, 0)).toBe(104);
    const p = initialPosition(); p.rack = rackFromText("Å?");
    p.board[112] = tile("Å", undefined, true);
    const hidden = unseenTiles(p)!;
    expect(hidden).toHaveLength(101);
    expect(hidden.filter(t => t.blank)).toHaveLength(0);
    expect(hidden.filter(t => t.letter === "Å")).toHaveLength(1);
    p.rack.push(tile("?", undefined, true));
    expect(unseenTiles(p)).toBeNull();
  });

  it("consumes the exact physical tiles and preserves unused blanks and duplicates", () => {
    const p = fixture(); p.rack = [...rackFromText("AA?"), tile("A", { A: 5 })];
    const move = scoreMove(p, [
      { index: 112, ...tile("A", { A: 5 }) },
      { index: 113, ...tile("T", undefined, true) },
    ], "across", lexicon)!;
    expect(remainingRack(p.rack, move)).toEqual(rackFromText("AA"));
    expect(p.rack).toHaveLength(4);
    expect(applyMove(p.board, move)[113]?.blank).toBe(true);
    expect(p.board[113]).toBeNull();
  });

  it("rewards blanks and balanced letters and penalizes duplicates", () => {
    expect(rackQuality(rackFromText("?AT"))).toBeGreaterThan(rackQuality(rackFromText("AAT")));
    expect(rackQuality(rackFromText("ATE"))).toBeGreaterThan(rackQuality(rackFromText("AAA")));
  });

  it("can recommend fewer immediate points to preserve a blank", () => {
    const p = initialPosition(); p.board[112] = tile("A");
    p.rack = rackFromText("TR?"); p.bonuses.fill("");
    const words = new Lexicon(["AT", "ATE", "TE", "ET", "TA", "ART", "AN", "RAN", "TAR", "RAT", "NE", "EN", "RET", "REN", "TEN", "TRE", "ER", "RE"]);
    const analysis = initialAnalysis(p, words);
    expect(analysis.pointsMoves[0].score).toBe(6);
    expect(analysis.strategyMoves[0].score).toBe(4);
    expect(analysis.strategyMoves[0].strategy.leave).toBe("?");
    expect(analysis.strategyMoves[0].placed.some(p => p.blank)).toBe(false);
  });

  it("projects a stronger next turn and smaller reply for a lower-scoring placement", () => {
    const p = initialPosition(); p.board[112] = tile("A"); p.rack = rackFromText("ARTEN");
    p.bonuses.fill(""); p.bonuses[115] = "TW"; p.bonuses[98] = "DL";
    const words = new Lexicon(["AT", "ATE", "TE", "ET", "TA", "ART", "AN", "RAN", "TAR", "RAT", "NE", "EN", "RET", "REN", "TEN", "TRE", "ER", "RE"]);
    const high = scoreMove(p, [
      { index: 83, ...tile("A") }, { index: 98, ...tile("R") }, { index: 113, ...tile("T") },
    ], "down", words)!;
    const smart = scoreMove(p, [{ index: 98, ...tile("A") }, { index: 113, ...tile("N") }], "down", words)!;
    const hidden = rackFromText("RETØÆXZ").concat(rackFromText("ANEBFØÅ"), rackFromText("EENRSIL"));
    const a = rollout(p, high, hidden, words, Infinity), b = rollout(p, smart, hidden, words, Infinity);
    expect(smart.score).toBeLessThan(high.score);
    expect(b.opponent).toBeLessThan(a.opponent);
    expect(b.next).toBeGreaterThan(a.next);
    expect(b.equity).toBeGreaterThan(a.equity);
  });

  it("shuffles reproducibly without inventing or reusing physical tiles", () => {
    const tiles = unseenTiles(fixture())!;
    const a = shuffleTiles(tiles, seededRandom("same-position"));
    expect(a).toEqual(shuffleTiles(tiles, seededRandom("same-position")));
    expect(a.map(t => t.letter).sort()).toEqual(tiles.map(t => t.letter).sort());
    expect(new Set(a)).toHaveProperty("size", tiles.length);
  });

  it("screens bonus openings without wrapping horizontal rays across rows", () => {
    const p = fixture(); p.bonuses.fill(""); p.bonuses[15] = "TW";
    const move = { ...solve(p, lexicon).moves[0], placed: [{ index: 14, ...tile("A") }] };
    expect(premiumExposure(p, move)).toBe(0);
    p.bonuses[13] = "TW";
    expect(premiumExposure(p, move)).toBe(8);
  });

  it("collects all legal candidates and supports ranking beyond immediate score", () => {
    const p = fixture(); const all = solve(p, lexicon, 1000).moves;
    const seen = new Set<string>();
    const lowest = solve(p, lexicon, 1, { evaluate: m => -m.score, onMove: m => seen.add(moveKey(m)) });
    expect(seen.size).toBe(all.length);
    expect(lowest.moves[0].score).toBe(Math.min(...all.map(m => m.score)));
    expect(solve(p, lexicon).moves[0].score).toBe(Math.max(...all.map(m => m.score)));
    expect(() => solve(p, lexicon, 1, { deadline: -1 })).toThrow(SearchDeadline);
  });

  it("does not reuse cached cross constraints after in-place board edits", () => {
    const p = fixture(); solve(p, lexicon);
    p.board[112] = tile("Å"); p.rack = rackFromText("L");
    expect(solve(p, lexicon).moves.every(m => m.word === "ÅL")).toBe(true);
    expect(solve(p, lexicon).moves.length).toBeGreaterThan(0);
  });

  it("retains exact scoring results when strategy tile accounting is impossible", () => {
    const p = fixture(); p.rack = rackFromText("AAAATE?");
    p.board[0] = tile("?", undefined, true); p.board[1] = tile("?", undefined, true);
    const result = initialAnalysis(p, lexicon);
    expect(result.method).toBe("unavailable");
    expect(result.strategyMoves).toEqual([]);
    expect(result.pointsMoves).toEqual(solve(p, lexicon).moves);
    expect(result.warning).toContain("distribution");
  });

  it("applies the doubled opponent rack transfer when our first move goes out", () => {
    const p = initialPosition(); p.rack = rackFromText("AT");
    const move = solve(p, lexicon).moves[0];
    const sample = rollout(p, move, [tile("Z"), tile("X")], lexicon, Infinity);
    expect(sample).toEqual({ equity: move.score + 36, opponent: 0, next: 0 });
  });

  it("ends immediately when the simulated opponent goes out", () => {
    const p = initialPosition(); p.board[112] = tile("A"); p.rack = rackFromText("TE");
    const move = scoreMove(p, [{ index: 113, ...tile("T") }], "across", lexicon)!;
    const sample = rollout(p, move, [tile("E")], lexicon, Infinity);
    expect(sample).toEqual({ equity: move.score - 4 - 2, opponent: 4, next: 0 });
  });

  it("models no-legal-placement replies as passes", () => {
    const p = initialPosition(); p.rack = rackFromText("ATZ");
    const move = scoreMove(p, [{ index: 112, ...tile("A") }, { index: 113, ...tile("T") }], "across", lexicon)!;
    const sample = rollout(p, move, [tile("X")], lexicon, Infinity);
    expect(sample.opponent).toBe(0); expect(sample.next).toBe(0);
    expect(sample.equity).toBe(move.score + rackQuality([tile("Z")]) - rackQuality([tile("X")]));
  });

  it("penalizes large replies separately from their mean", () => {
    const move = initialAnalysis(fixture(), lexicon).strategyMoves[0];
    const result = summarizeSamples(move, [
      { equity: 20, opponent: 0, next: 20 }, { equity: 20, opponent: 40, next: 60 },
    ]);
    expect(result.strategy.value).toBe(15);
    expect(result.strategy.replyP90).toBe(40);
    expect(result.strategy.opponentMean).toBe(20);
  });

  it("commits only complete comparison rounds and retains the preceding snapshot", async () => {
    const p = fixture(), initial = initialAnalysis(p, lexicon);
    let calls = 0;
    const result = await analyzeStrategy(p, lexicon, initial, () => {}, {
      budgetMs: 1000, maxRounds: 3,
      simulate: (_p, m) => {
        if (++calls === initial.strategyMoves.length + 2) throw new SearchDeadline();
        return { equity: m.score, opponent: 10, next: 12 };
      },
    });
    expect(result.rounds).toBe(1);
    expect(result.strategyMoves.every(m => m.strategy.samples === 1)).toBe(true);
    const timeout = await analyzeStrategy(p, lexicon, initial, () => {}, { budgetMs: 0 });
    expect(timeout).toEqual(initial);
  });

  it("simulates the same worlds for all candidates and repeats fixed-round analysis", async () => {
    const p = fixture(), initial = initialAnalysis(p, lexicon);
    const worlds: string[] = [];
    await analyzeStrategy(p, lexicon, initial, () => {}, { maxRounds: 2, simulate: (_p, m, hidden) => {
      worlds.push(hidden.map(t => t.letter).join(""));
      return { equity: m.score, opponent: 0, next: 0 };
    } });
    const n = initial.strategyMoves.length;
    expect(new Set(worlds.slice(0, n)).size).toBe(1);
    expect(new Set(worlds.slice(n)).size).toBe(1);
    expect(worlds[0]).not.toBe(worlds[n]);
    const a = await analyzeStrategy(p, lexicon, initial, () => {}, { maxRounds: 2 });
    const b = await analyzeStrategy(p, lexicon, initial, () => {}, { maxRounds: 2 });
    expect(a).toEqual(b);
  });
});
