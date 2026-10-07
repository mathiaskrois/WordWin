import { describe, it, expect } from "vitest";
import { Lexicon, scoreMove, solve } from "../../src/solver";
import {
  ALTERNATE,
  CLASSIC,
  DA_VALUES,
  bonusesFor,
  initialPosition,
  normalizeWords,
  rackFromText,
  tile,
  type Move,
  type Placement,
  type Position,
} from "../../src/model";
const key = (p: Placement[]) =>
  p
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((t) => `${t.index}:${t.letter}:${t.value}:${t.blank}`)
    .join("|");
function reference(position: Position, words: string[]): Map<string, number> {
  const out = new Map<string, number>(),
    dictionary = new Set(words),
    empty = !position.board.some(Boolean);
  // Deliberately enumerate every dictionary word at every position, rather than using a trie or anchors.
  for (const word of words)
    for (const delta of [1, 15])
      for (let start = 0; start < 225; start++) {
        if (
          delta === 1
            ? (start % 15) + word.length > 15
            : Math.floor(start / 15) + word.length > 15
        )
          continue;
        const before = start - delta,
          after = start + word.length * delta;
        if (
          before >= 0 &&
          (delta === 15 || start % 15 > 0) &&
          position.board[before]
        )
          continue;
        if (
          after < 225 &&
          (delta === 15 || after % 15 !== 0) &&
          position.board[after]
        )
          continue;
        const needed: { index: number; letter: string }[] = [];
        let ok = true;
        for (let k = 0; k < word.length; k++) {
          const index = start + k * delta;
          const t = position.board[index];
          if (t && t.letter !== word[k]) {
            ok = false;
            break;
          }
          if (!t) needed.push({ index, letter: word[k] });
        }
        if (!ok || !needed.length || needed.length > position.rack.length)
          continue;
        if (
          empty
            ? !Array.from(
                { length: word.length },
                (_, k) => start + k * delta,
              ).includes(112)
            : !needed.some((t) =>
                [
                  t.index - 15,
                  t.index + 15,
                  ...(t.index % 15 ? [t.index - 1] : []),
                  ...(t.index % 15 < 14 ? [t.index + 1] : []),
                ].some((j) => position.board[j]),
              )
        )
          continue;
        function assign(n: number, used: Set<number>, placed: Placement[]) {
          if (n < needed.length) {
            for (let i = 0; i < position.rack.length; i++) {
              const t = position.rack[i];
              if (!used.has(i) && (t.blank || t.letter === needed[n].letter)) {
                assign(n + 1, new Set([...used, i]), [
                  ...placed,
                  {
                    ...needed[n],
                    value: t.blank ? 0 : t.value,
                    blank: t.blank,
                  },
                ]);
              }
            }
            return;
          }
          const board = position.board.slice();
          for (const t of placed) board[t.index] = t;
          const fresh = new Set(placed.map((t) => t.index));
          let points = 0;
          const lines: number[][] = [
            Array.from({ length: word.length }, (_, k) => start + k * delta),
          ];
          const opposite = delta === 1 ? 15 : 1;
          for (const p of placed) {
            const indices = [p.index];
            let j = p.index;
            while (
              j - opposite >= 0 &&
              (opposite === 15 || j % 15 > 0) &&
              board[j - opposite]
            ) {
              j -= opposite;
              indices.unshift(j);
            }
            j = p.index;
            while (
              j + opposite < 225 &&
              (opposite === 15 || j % 15 < 14) &&
              board[j + opposite]
            ) {
              j += opposite;
              indices.push(j);
            }
            if (indices.length > 1) lines.push(indices);
          }
          for (const indices of lines) {
            if (!dictionary.has(indices.map((i) => board[i]!.letter).join("")))
              return;
            let subtotal = 0,
              multiplier = 1;
            for (const i of indices) {
              const bonus = fresh.has(i) ? position.bonuses[i] : "";
              subtotal +=
                board[i]!.value * (bonus === "DL" ? 2 : bonus === "TL" ? 3 : 1);
              multiplier *= bonus === "DW" ? 2 : bonus === "TW" ? 3 : 1;
            }
            points += subtotal * multiplier;
          }
          if (placed.length === 7) points += position.rules.bingo;
          out.set(key(placed), points);
        }
        assign(0, new Set(), []);
      }
  return out;
}
describe("board layouts", () => {
  it("reconstructs all bonuses with reflection and keeps layouts distinct", () => {
    for (const b of [CLASSIC, ALTERNATE])
      for (let r = 0; r < 15; r++)
        for (let c = 0; c < 15; c++) {
          expect(b[r * 15 + c]).toBe(b[(14 - r) * 15 + c]);
          expect(b[r * 15 + c]).toBe(b[r * 15 + 14 - c]);
        }
    expect(CLASSIC).not.toEqual(ALTERNATE);
    expect(CLASSIC.filter((b) => b === "TW")).toHaveLength(8);
    expect(ALTERNATE.filter((b) => b === "TW")).toHaveLength(8);
    expect(bonusesFor("classic")[112]).toBe("DW");
    expect(bonusesFor("alternate")[112]).toBe("");
  });
  it("restores bonuses hidden under CURLER and R/T/S", () => {
    expect(ALTERNATE[12 * 15 + 2]).toBe("TW");
    expect(ALTERNATE[12 * 15 + 5]).toBe("DL");
    expect(ALTERNATE[6 * 15 + 6]).toBe("TL");
    expect(ALTERNATE[8 * 15 + 6]).toBe("TL");
    expect(ALTERNATE[8 * 15 + 8]).toBe("TL");
  });
});
describe("scoring and legality", () => {
  it("reproduces the screenshot CURLER = 54 points", () => {
    const p = initialPosition("alternate");
    for (const [i, l] of [
      [6 * 15 + 6, "R"],
      [7 * 15 + 6, "A"],
      [7 * 15 + 7, "L"],
      [8 * 15 + 6, "T"],
      [8 * 15 + 7, "Ø"],
      [8 * 15 + 8, "S"],
      [9 * 15 + 7, "N"],
      [9 * 15 + 8, "I"],
      [10 * 15 + 7, "N"],
      [11 * 15 + 7, "E"],
      [12 * 15 + 7, "R"],
    ] as const)
      p.board[i] = tile(l);
    const placed = [..."CURLE"].map((letter, k) => ({
      index: 12 * 15 + 2 + k,
      ...tile(letter),
    }));
    expect(scoreMove(p, placed, "across", new Lexicon(["CURLER"]))?.score).toBe(
      54,
    );
  });
  it("requires center coverage on the opening move", () => {
    const p = initialPosition();
    const lex = new Lexicon(["AT"]);
    expect(
      scoreMove(
        p,
        [
          { index: 0, ...tile("A") },
          { index: 1, ...tile("T") },
        ],
        "across",
        lex,
      ),
    ).toBeNull();
    expect(
      scoreMove(
        p,
        [
          { index: 112, ...tile("A") },
          { index: 113, ...tile("T") },
        ],
        "across",
        lex,
      )?.score,
    ).toBe(6);
  });
  it("rejects gaps, diagonal placement, disconnection and invalid crossing words", () => {
    const p = initialPosition();
    p.board[112] = tile("A");
    const lex = new Lexicon(["AT", "TA"]);
    expect(
      scoreMove(
        p,
        [
          { index: 113, ...tile("T") },
          { index: 115, ...tile("A") },
        ],
        "across",
        lex,
      ),
    ).toBeNull();
    expect(
      scoreMove(
        p,
        [
          { index: 113, ...tile("T") },
          { index: 128, ...tile("A") },
        ],
        "across",
        lex,
      ),
    ).toBeNull();
    expect(
      scoreMove(
        p,
        [
          { index: 0, ...tile("T") },
          { index: 1, ...tile("A") },
        ],
        "across",
        lex,
      ),
    ).toBeNull();
    p.board[98] = tile("X");
    expect(
      scoreMove(p, [{ index: 113, ...tile("T") }], "across", lex),
    ).toBeNull();
  });
  it("does not reuse a covered multiplier and counts zero-point blanks", () => {
    const p = initialPosition();
    p.board[112] = tile("A");
    const move = scoreMove(
      p,
      [{ index: 113, ...tile("T", DA_VALUES, true) }],
      "across",
      new Lexicon(["AT"]),
    );
    expect(move?.score).toBe(1);
    expect(move?.placed[0].blank).toBe(true);
  });
  it("adds exactly 40 for using seven tiles", () => {
    const p = initialPosition("alternate");
    p.bonuses.fill("");
    const letters = "ABCDEFG";
    const placements = [...letters].map((l, i) => ({
      index: 109 + i,
      ...tile(l),
    }));
    const m = scoreMove(p, placements, "across", new Lexicon([letters]));
    expect(m?.bingo).toBe(40);
    expect(m?.score).toBe([...letters].reduce((s, l) => s + DA_VALUES[l], 40));
  });
  it("allows single placed tile forming a perpendicular word and scores both crossings", () => {
    const p = initialPosition("alternate");
    p.bonuses.fill("");
    p.board[111] = tile("A");
    p.board[97] = tile("A");
    const m = scoreMove(
      p,
      [{ index: 112, ...tile("T") }],
      "across",
      new Lexicon(["AT"]),
    );
    expect(m?.score).toBe(6);
    expect(m?.words.map((w) => w.word)).toEqual(["AT", "AT"]);
  });
});
describe("exhaustive move generation", () => {
  const words = [
    "AT",
    "CAT",
    "CATS",
    "ACT",
    "TACT",
    "TACTS",
    "AS",
    "SAT",
    "SCAT",
    "CAST",
    "TATS",
    "TA",
    "AA",
    "AC",
    "CA",
    "CT",
    "TC",
    "SA",
    "TS",
    "ST",
    "CS",
  ];
  for (let seed = 0; seed < 12; seed++)
    it(`matches independent brute-force moves and scores, position ${seed}`, () => {
      const p = initialPosition(seed % 2 ? "alternate" : "classic");
      if (seed > 0) {
        for (let i = 0; i < 3; i++) p.board[111 + i] = tile("CAT"[i]);
        if (seed % 3 === 0) p.board[128] = tile("S");
      }
      p.rack = rackFromText(
        ["CATS", "AA?T", "S?A", "CATTS", "?T", "AACS"][seed % 6],
      );
      const expected = reference(p, words);
      const actual = solve(p, new Lexicon(words), 100000).moves;
      expect(new Map(actual.map((m) => [key(m.placed), m.score]))).toEqual(
        expected,
      );
      for (let i = 1; i < actual.length; i++)
        expect(actual[i - 1].score).toBeGreaterThanOrEqual(actual[i].score);
    });
  it("keeps all Danish characters and excludes one-letter words", () => {
    const words = normalizeWords("æg\nØL\nå\nÅL\nÆG\nhello world\n");
    expect(words).toEqual(["ÆG", "ØL", "ÅL"]);
    const p = initialPosition();
    p.rack = rackFromText("ÆGØLÅL?");
    const moves = solve(p, new Lexicon(words)).moves;
    expect(moves.some((m) => m.word === "ÆG")).toBe(true);
    expect(moves.some((m) => m.word === "ØL")).toBe(true);
  });
  it("never uses a rack tile twice", () => {
    const p = initialPosition();
    p.rack = rackFromText("AT");
    expect(
      solve(p, new Lexicon(["AT", "TAT", "AAT"])).moves.every(
        (m) => m.word === "AT",
      ),
    ).toBe(true);
  });
});
