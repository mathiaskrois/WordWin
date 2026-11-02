import { bonusesFor, type Bonus, type Layout } from "./model";
export interface Crop {
  x: number;
  y: number;
  size: number;
  rackY: number;
  rackX: number;
  rackWidth: number;
}
export type { Layout } from "./model";
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export function pixel(image: Pixels, x: number, y: number): number[] {
  const i =
    (Math.max(0, Math.min(image.height - 1, Math.round(y))) * image.width +
      Math.max(0, Math.min(image.width - 1, Math.round(x)))) *
    4;
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
}
export function classify([r, g, b]: number[]):
  Bonus | "tile" | "plain" | "other" {
  if (
    r > 145 &&
    g > 140 &&
    b > 115 &&
    Math.max(r, g, b) - Math.min(r, g, b) < 85
  )
    return "tile";
  if (r > 115 && r < 190 && g < 100 && b > 150) return "5W";
  if (r > 130 && g < 115 && b > 115) return "4W";
  if (r < 100 && g > 95 && g > b * 1.35 && g > r * 1.3) return "5L";
  if (r < 75 && g > 90 && b > 80 && g > b * 0.85) return "4L";
  if (r > 150 && g > 95 && g < 185 && b < 115) return "DW";
  if (r > 145 && g < 120 && b < 125) return "TW";
  if (b > 155 && g > 100 && r < 130) return "DL";
  if (b > 105 && b < 185 && g > 60 && g < 135 && r < 100) return "TL";
  if (r > 18 && r < 55 && g > 30 && g < 65 && b > 50 && b < 105) return "plain";
  return "other";
}
export function detectBoard(image: Pixels): {
  crop: Crop;
  layout: Layout;
  confidence: number;
} {
  // Locate the grid by cell interiors and repeated gaps, independent of bonuses.
  let best = { score: -Infinity, y: 0, x: 0, size: image.width };
  const sizes = [1, 0.96, 0.92, 0.86].map((f) => image.width * f);
  for (const size of sizes) {
    const x = (image.width - size) / 2, step = size / 15;
    for (let y = Math.round(image.height * 0.16);
      y + size < image.height * 0.88;
      y += Math.max(2, Math.round(image.width / 350))) {
      let score = 0;
      for (let r = 0; r < 15; r++)
        for (let c = 0; c < 15; c++) {
          const inside = pixel(image, x + (c + 0.26) * step, y + (r + 0.26) * step);
          const actual = classify(inside);
          score += actual === "other" ? -3 : 1;
          // Grid gaps are darker than both ordinary squares and premiums.
          for (const [dx, dy] of [[0.995, 0.5], [0.5, 0.995]]) {
            const gap = pixel(image, x + (c + dx) * step, y + (r + dy) * step);
            const contrast = inside.reduce((sum, value, i) => sum + value - gap[i], 0);
            score += Math.max(-1, Math.min(1, contrast / 40));
          }
        }
      if (score > best.score) best = { score, y, x, size };
    }
  }
  const step = best.size / 15;
  // Refine the top edge using full-width horizontal cell gaps.
  let refinedY = best.y,
    seamBest = -Infinity;
  for (
    let shift = -Math.round(step * 0.25);
    shift <= Math.round(step * 0.25);
    shift++
  ) {
    const y = best.y + shift;
    let score = 0;
    for (let r = 1; r < 15; r++)
      for (let c = 0; c < 15; c++) {
        const middle = pixel(
          image,
          best.x + (c + 0.5) * step,
          y + r * step - 1,
        );
        const inside = pixel(
          image,
          best.x + (c + 0.5) * step,
          y + (r + 0.18) * step,
        );
        score +=
          inside[0] + inside[1] + inside[2] - middle[0] - middle[1] - middle[2];
      }
    if (score > seamBest) {
      seamBest = score;
      refinedY = y;
    }
  }
  let rackY = refinedY + best.size + step * 0.9,
    most = 0;
  for (
    let y = Math.round(refinedY + best.size + step * 0.25);
    y < image.height * 0.94;
    y += 3
  ) {
    let count = 0;
    for (let c = 0; c < 7; c++)
      if (classify(pixel(image, (image.width * (c + 0.35)) / 7, y)) === "tile")
        count++;
    if (count > most) {
      most = count;
      rackY = y;
    }
  }
  let rackX = image.width * 0.025,
    rackWidth = image.width * 0.95;
  const rackStep = rackWidth / 7;
  // Read the cream runs below the letters to locate actual rack tile edges.
  const runs: { start: number; end: number }[] = [];
  let start = -1;
  for (let x = 0; x < image.width; x++) {
    const cream = classify(pixel(image, x, rackY + rackStep * 0.82)) === "tile";
    if (cream && start < 0) start = x;
    if (!cream && start >= 0) {
      if (x - start > rackStep * 0.65) runs.push({ start, end: x });
      start = -1;
    }
  }
  if (runs.length === 7) {
    rackX = runs[0].start;
    rackWidth = ((runs[6].start - runs[0].start) / 6) * 7;
  }
  const crop = { x: best.x, y: refinedY, size: best.size, rackY, rackX, rackWidth };
  return {
    crop,
    layout: readBonuses(image, crop).layout,
    confidence: Math.max(0, Math.min(1, best.score / 450)),
  };
}
export function occupied(
  image: Pixels,
  x: number,
  y: number,
  size: number,
): boolean {
  let count = 0;
  for (const dx of [0.18, 0.35, 0.78])
    for (const dy of [0.18, 0.45, 0.78])
      if (classify(pixel(image, x + size * dx, y + size * dy)) === "tile")
        count++;
  return count >= 4;
}

/** Read each square independently; covered squares are irrelevant to future scoring. */
export function readBonuses(image: Pixels, crop: Crop): { bonuses: Bonus[]; layout: Layout } {
  const step = crop.size / 15;
  const visible = Array.from({ length: 225 }, (_, i) => {
    const votes = new Map<ReturnType<typeof classify>, number>();
    for (const dx of [0.2, 0.75])
      for (const dy of [0.2, 0.75]) {
        const kind = classify(pixel(image, crop.x + (i % 15 + dx) * step,
          crop.y + (Math.floor(i / 15) + dy) * step));
        votes.set(kind, (votes.get(kind) ?? 0) + 1);
      }
    return [...votes].sort((a, b) => b[1] - a[1])[0][0];
  });
  for (const layout of ["classic", "alternate"] as const) {
    const template = bonusesFor(layout);
    let checked = 0, matches = 0;
    visible.forEach((kind, i) => {
      if (kind === "tile" || kind === "other") return;
      checked++;
      if ((kind === "plain" ? "" : kind) === template[i]) matches++;
    });
    if (checked >= 20 && matches / checked >= 0.97) return {
      layout, bonuses: template.map((bonus, i) => {
        const kind = visible[i];
        return kind === "tile" || kind === "other" ? bonus : kind === "plain" ? "" : kind;
      }),
    };
  }
  return { layout: "custom", bonuses: visible.map(kind =>
    kind === "tile" || kind === "plain" || kind === "other" ? "" : kind) };
}
