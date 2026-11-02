import { expect, it } from "vitest";
import sharp from "sharp";
import { detectBoard, occupied, readBonuses } from "../../src/vision";
import { bonusesFor, initialPosition, tile } from "../../src/model";
import { Lexicon, scoreMove } from "../../src/solver";

it("reads the asymmetric screenshot without reflecting premiums", async () => {
  const { data, info } = await sharp(process.env.WORDWIN_SCREENSHOT || "tests/fixtures/asymmetric-board.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const image = { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  const fit = detectBoard(image);
  expect(fit.layout).toBe("custom");
  expect(fit.crop.x).toBeCloseTo(0);
  expect(Math.abs(fit.crop.y - 626 * info.width / 946)).toBeLessThan(8);
  expect(fit.crop.size).toBe(info.width);
  const rows = [
    "TW . DL . . TW . . . 4L . . TW . .",
    ". . . . TL . . 4W . . . DL . . TW",
    "DL . TW . . . DL . . . TW . . . .",
    ". 4L . . . . . . TW . . . . 5L .",
    ". . . TW . . DL . . . . 4W . . .",
    "TW . . . . 5W . . . . DL . . . TW",
    ". . DL . . . . TL . . . . TL . .",
    ". TL . . . . . . . . . TW . . .",
    ". . . . . . DL . . 5L . . . DL .",
    "4W . . TW . . . . . . . . TW . .",
    ". . . . . . TW . . . 4L . . . .",
    ". DL . . 5L . . . DL . . . . TW .",
    "TW . . . . . . TW . . . . . . .",
    ". . . 4W . . . . . . TW . DL . 5W",
    ". TW . . . . DL . . . . . . TW .",
  ];
  const expected = rows.flatMap(row => row.split(" ").map(b => b === "." ? "" : b));
  expect(readBonuses(image, fit.crop).bonuses).toEqual(expected);
  const step = fit.crop.size / 15;
  const cells = Array.from({ length: 225 }, (_, i) => i).filter(i => occupied(image, fit.crop.x + i % 15 * step, fit.crop.y + Math.floor(i / 15) * step, step));
  expect(cells).toEqual([109, 110, 111, 112]);
  expect(Math.abs(fit.crop.rackY - 1684 * info.width / 946)).toBeLessThan(8);
});

it.each(["classic", "alternate"] as const)("preserves the %s template under covered squares", layout => {
  const width = 750, height = 1624, data = new Uint8ClampedArray(width * height * 4);
  const colors = { "": [34, 49, 73], DL: [81, 142, 221], TL: [48, 84, 135], DW: [223, 136, 65], TW: [190, 86, 72], "4L": [], "5L": [], "4W": [], "5W": [] };
  const bonuses = bonusesFor(layout);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = Math.floor((y - 400) / 50), col = Math.floor(x / 50);
    const inside = row >= 0 && row < 15 && x % 50 >= 2 && x % 50 < 48 && (y - 400) % 50 >= 2 && (y - 400) % 50 < 48;
    const rgb = inside ? (row === 7 && col === 7 ? [240, 234, 219] : colors[bonuses[row * 15 + col]]) : [16, 26, 41];
    data.set([...rgb, 255], (y * width + x) * 4);
  }
  const image = { width, height, data }, fit = detectBoard(image);
  expect(Math.abs(fit.crop.y - 400)).toBeLessThan(5);
  expect(fit.layout).toBe(layout);
  expect(readBonuses(image, fit.crop).bonuses).toEqual(bonuses);
});

it("scores 4×/5× premiums together and ignores consumed premiums", () => {
  const p = initialPosition("custom");
  p.board[112] = tile("A");
  p.bonuses[112] = "5W";
  p.bonuses[113] = "4L";
  p.bonuses[114] = "5L";
  p.bonuses[115] = "4W";
  p.bonuses[116] = "5W";
  const placed = [..."BCDE"].map((letter, n) => ({ ...tile(letter), index: 113 + n }));
  const move = scoreMove(p, placed, "across", new Lexicon(["ABCDE"]));
  expect(move?.score).toBe((1 + 3 * 4 + 8 * 5 + 2 + 1) * 4 * 5);
});
