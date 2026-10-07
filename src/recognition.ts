import { createWorker, PSM } from "tesseract.js";
import { detectBoard, occupied, pixel, type Crop, type Layout } from "./vision";
import {
  ALPHABET,
  DA_VALUES,
  bonusesFor,
  emptyBoard,
  type Board,
  type Tile,
  type Bonus,
} from "./model";
import { classifyGlyph, classifyPoints } from "./glyphs";
export interface Recognition {
  board: Board;
  rack: Tile[];
  bonuses: Bonus[];
  layout: Layout;
  crop: Crop;
  uncertain: number[];
  rackUncertain: number[];
}
export async function imageCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function glyph(
  source: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  digit = false,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 160, 160);
  ctx.drawImage(
    source,
    x + w * (digit ? 0.67 : 0.06),
    y + h * (digit ? 0.02 : 0.12),
    w * (digit ? 0.29 : 0.86),
    h * (digit ? 0.4 : 0.8),
    20,
    20,
    120,
    120,
  );
  const data = ctx.getImageData(0, 0, 160, 160);
  for (let yy = 20; yy < 140; yy++)
    for (let xx = 20; xx < 140; xx++) {
      const i = (yy * 160 + xx) * 4;
      const bright = Math.max(data.data[i], data.data[i + 1], data.data[i + 2]);
      const value = bright < 135 ? 0 : 255;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = value;
    }
  {
    // Keep the letter's connected strokes rather than erasing a corner: Æ extends
    // into that corner. Remove detached point digits, while retaining Å's ring.
    const visited = new Uint8Array(160 * 160),
      components: {
        pixels: number[];
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
      }[] = [];
    for (let p = 0; p < 160 * 160; p++)
      if (!visited[p] && data.data[p * 4] === 0) {
        const component = {
          pixels: [p],
          minX: p % 160,
          maxX: p % 160,
          minY: Math.floor(p / 160),
          maxY: Math.floor(p / 160),
        };
        visited[p] = 1;
        for (let cursor = 0; cursor < component.pixels.length; cursor++) {
          const j = component.pixels[cursor],
            x = j % 160,
            y = Math.floor(j / 160);
          component.minX = Math.min(component.minX, x);
          component.maxX = Math.max(component.maxX, x);
          component.minY = Math.min(component.minY, y);
          component.maxY = Math.max(component.maxY, y);
          for (const q of [
            j - 160,
            j + 160,
            ...(x > 0 ? [j - 1] : []),
            ...(x < 159 ? [j + 1] : []),
          ])
            if (
              q >= 0 &&
              q < 160 * 160 &&
              !visited[q] &&
              data.data[q * 4] === 0
            ) {
              visited[q] = 1;
              component.pixels.push(q);
            }
        }
        components.push(component);
      }
    components.sort((a, b) => b.pixels.length - a.pixels.length);
    const main = components[0];
    if (digit) {
      // Ignore remnants of the large letter entering the bottom of the points crop.
      const isBorder = (c: (typeof components)[number]) =>
        (c.minY <= 20 && c.maxY >= 139) || (c.minX <= 20 && c.maxX >= 139);
      const candidates = components.filter((c) => !isBorder(c));
      const largest = Math.max(0, ...candidates.map((c) => c.pixels.length));
      const useful = candidates.filter(
        (c) => c.pixels.length >= largest * 0.12,
      );
      const top = Math.min(...useful.map((c) => c.minY));
      for (const comp of components)
        if (
          !useful.includes(comp) ||
          comp.minY > top + 25 ||
          (comp.maxY >= 139 && comp.minY > top + 12)
        )
          for (const p of comp.pixels)
            data.data[p * 4] =
              data.data[p * 4 + 1] =
              data.data[p * 4 + 2] =
                255;
    } else if (main)
      for (const comp of components.slice(1)) {
        const center = (comp.minX + comp.maxX) / 2;
        const isRing =
          comp.maxY < main.minY &&
          comp.maxY >= main.minY - 30 &&
          Math.abs(center - (main.minX + main.maxX) / 2) <
            (main.maxX - main.minX) * 0.16;
        if (!isRing)
          for (const p of comp.pixels)
            data.data[p * 4] =
              data.data[p * 4 + 1] =
              data.data[p * 4 + 2] =
                255;
      }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}
export async function recognize(
  source: HTMLCanvasElement,
  onProgress: (s: string) => void,
  signal: AbortSignal,
  manual?: Crop,
): Promise<Recognition> {
  const ctx = source.getContext("2d")!;
  const pixels = ctx.getImageData(0, 0, source.width, source.height);
  const fit = detectBoard(pixels);
  const crop = manual ?? fit.crop;
  const worker = await createWorker(["dan", "eng"], 1, {
    workerPath: `${import.meta.env.BASE_URL}ocr/worker.min.js`,
    corePath: `${import.meta.env.BASE_URL}ocr/`,
    langPath: `${import.meta.env.BASE_URL}ocr/`,
    logger: (m) => {
      if (m.status === "loading language traineddata")
        onProgress("Preparing letter recognition…");
    },
  });
  const abort = () => {
    void worker.terminate();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw new Error("Import cancelled.");
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_CHAR,
      tessedit_char_whitelist: ALPHABET + "0123456789",
    });
    const board = emptyBoard(),
      rack: Tile[] = [],
      uncertain: number[] = [],
      rackUncertain: number[] = [];
    const cells: {
      index: number;
      x: number;
      y: number;
      w: number;
      h: number;
      rack: boolean;
    }[] = [];
    const step = crop.size / 15;
    for (let i = 0; i < 225; i++) {
      const x = crop.x + (i % 15) * step,
        y = crop.y + Math.floor(i / 15) * step;
      if (occupied(pixels, x, y, step))
        cells.push({ index: i, x, y, w: step, h: step, rack: false });
    }
    const rackStep = crop.rackWidth / 7,
      rackTile = rackStep * 0.93;
    // rackY is the first cream pixel scanline, just inside the tile's upper edge.
    const ry = crop.rackY - 4;
    for (let i = 0; i < 7; i++)
      if (occupied(pixels, crop.rackX + i * rackStep, ry, rackTile))
        cells.push({
          index: i,
          x: crop.rackX + i * rackStep,
          y: ry,
          w: rackTile,
          h: rackTile,
          rack: true,
        });
    for (let n = 0; n < cells.length; n++) {
      if (signal.aborted) throw new Error("Import cancelled.");
      const cell = cells[n];
      onProgress(`Reading tile ${n + 1} of ${cells.length}…`);
      await worker.setParameters({ tessedit_char_whitelist: "" });
      const letterImage = glyph(source, cell.x, cell.y, cell.w, cell.h);
      const result = await worker.recognize(letterImage);
      let letter = result.data.text.trim().replace(/\s/g, "").toUpperCase();
      if (
        ["|", "!", "1", "L"].includes(letter) &&
        result.data.text.trim() === "|"
      )
        letter = "I";
      if (letter === "0") letter = "O";
      if (letter === "AE") letter = "Æ";
      if (letter === "OE") letter = "Ø";
      const template = classifyGlyph(letterImage);
      // Use generated font templates to disambiguate isolated glyphs such as
      // Æ/Å/A, Ø/O/Q and I/|. OCR alone often gives a confident wrong answer.
      if (
        template &&
        template.distance < 0.5 &&
        (template.margin > 0.035 || !ALPHABET.includes(letter))
      )
        letter = template.letter;
      const valid = letter.length === 1 && ALPHABET.includes(letter);
      await worker.setParameters({ tessedit_char_whitelist: "0123456789" });
      const pointsImage = glyph(source, cell.x, cell.y, cell.w, cell.h, true);
      const pointTemplate = classifyPoints(pointsImage);
      const points = pointTemplate
        ? await worker.recognize(pointsImage)
        : { data: { text: "", confidence: 0 } };
      const number = points.data.text.trim();
      let value =
        /^\d{1,2}$/.test(number) && Number(number) <= 10
          ? Number(number)
          : undefined;
      if (
        pointTemplate &&
        pointTemplate.distance < 0.5 &&
        pointTemplate.margin > 0.035
      )
        value = pointTemplate.value;
      // An empty glyph is a blank; unreadable marked glyphs remain explicitly uncertain.
      const g = glyph(source, cell.x, cell.y, cell.w, cell.h);
      const gdata = g.getContext("2d")!.getImageData(0, 0, 160, 160);
      let ink = 0;
      for (let i = 0; i < gdata.data.length; i += 4)
        if (gdata.data[i] === 0) ink++;
      const blank = value === 0 || (cell.rack && ink < 40);
      const t: Tile = {
        letter: blank && cell.rack ? "?" : valid ? letter : "?",
        value: blank ? 0 : (value ?? DA_VALUES[letter] ?? 1),
        blank,
      };
      const uncertainTile =
        (!valid && !blank) ||
        (template
          ? template.distance > 0.45 || template.margin < 0.025
          : result.data.confidence < 65) ||
        (!blank &&
          (value === undefined || (pointTemplate?.distance ?? 1) > 0.5));
      if (cell.rack) {
        if (uncertainTile) rackUncertain.push(rack.length);
        rack.push(t);
      } else {
        board[cell.index] = t;
        if (uncertainTile) uncertain.push(cell.index);
      }
    }
    const bonuses = bonusesFor(fit.layout);
    // Read visible bonuses, but preserve template values underneath occupied tiles.
    // Center remains the layout's preset, and can be explicitly edited in the UI.
    void pixel;
    return {
      board,
      rack,
      bonuses,
      layout: fit.layout,
      crop,
      uncertain,
      rackUncertain,
    };
  } finally {
    signal.removeEventListener("abort", abort);
    await worker.terminate();
  }
}
