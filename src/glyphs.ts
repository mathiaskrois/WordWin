import { ALPHABET } from "./model";
const WIDTH = 32,
  HEIGHT = 48;
interface Shape {
  mask: Uint8Array;
  ratio: number;
  holes: number;
  ink: number;
}
function shape(canvas: HTMLCanvasElement): Shape | null {
  const image = canvas
    .getContext("2d")!
    .getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width,
    minY = canvas.height,
    maxX = 0,
    maxY = 0,
    ink = 0;
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (image.data[i] < 135) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        ink++;
      }
    }
  if (!ink) return null;
  const cropped = document.createElement("canvas");
  cropped.width = WIDTH;
  cropped.height = HEIGHT;
  const context = cropped.getContext("2d")!;
  context.fillStyle = "white";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.drawImage(
    canvas,
    minX,
    minY,
    maxX - minX + 1,
    maxY - minY + 1,
    0,
    0,
    WIDTH,
    HEIGHT,
  );
  const data = context.getImageData(0, 0, WIDTH, HEIGHT).data,
    mask = new Uint8Array(WIDTH * HEIGHT);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4] < 135 ? 1 : 0;
  const visited = new Uint8Array(mask.length);
  let holes = 0;
  for (let i = 0; i < mask.length; i++)
    if (!visited[i] && !mask[i]) {
      const queue = [i];
      visited[i] = 1;
      let border = false;
      for (let k = 0; k < queue.length; k++) {
        const j = queue[k],
          x = j % WIDTH,
          y = Math.floor(j / WIDTH);
        if (x === 0 || x === WIDTH - 1 || y === 0 || y === HEIGHT - 1)
          border = true;
        for (const q of [
          j - WIDTH,
          j + WIDTH,
          ...(x ? [j - 1] : []),
          ...(x < WIDTH - 1 ? [j + 1] : []),
        ])
          if (q >= 0 && q < mask.length && !visited[q] && !mask[q]) {
            visited[q] = 1;
            queue.push(q);
          }
      }
      if (!border && queue.length > 3) holes++;
    }
  return { mask, ratio: (maxX - minX + 1) / (maxY - minY + 1), holes, ink };
}
let templates: { letter: string; shape: Shape }[] | undefined;
let digitTemplates: { letter: string; shape: Shape }[] | undefined;
export function classifyGlyph(
  canvas: HTMLCanvasElement,
): { letter: string; distance: number; margin: number } | null {
  const input = shape(canvas);
  if (!input) return null;
  if (!templates) {
    templates = [];
    for (const font of [
      "Arial",
      "Arial Narrow",
      "Segoe UI",
      "Calibri",
      "Trebuchet MS",
      "Helvetica",
    ])
      for (const weight of [400, 600])
        for (const letter of ALPHABET) {
          const c = document.createElement("canvas");
          c.width = 180;
          c.height = 180;
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, 180, 180);
          ctx.fillStyle = "black";
          ctx.font = `${weight} 110px "${font}"`;
          ctx.textBaseline = "middle";
          ctx.fillText(letter, 20, 85);
          const s = shape(c);
          if (s) templates.push({ letter, shape: s });
        }
  }
  const candidates = new Map<string, number>();
  for (const template of templates) {
    let different = 0,
      union = 0;
    for (let i = 0; i < input.mask.length; i++) {
      different += Math.abs(input.mask[i] - template.shape.mask[i]);
      union += input.mask[i] || template.shape.mask[i];
    }
    const distance =
      different / Math.max(1, union) +
      0.15 * Math.abs(Math.log(input.ratio / template.shape.ratio)) +
      0.03 * Math.abs(input.holes - template.shape.holes);
    if (distance < (candidates.get(template.letter) ?? Infinity))
      candidates.set(template.letter, distance);
  }
  const sorted = [...candidates].sort((a, b) => a[1] - b[1]);
  return {
    letter: sorted[0][0],
    distance: sorted[0][1],
    margin: sorted[1][1] - sorted[0][1],
  };
}
export function classifyPoints(
  canvas: HTMLCanvasElement,
): { value: number; distance: number; margin: number } | null {
  const input = shape(canvas);
  if (!input) return null;
  if (!digitTemplates) {
    digitTemplates = [];
    for (const font of [
      "Arial",
      "Arial Narrow",
      "Segoe UI",
      "Calibri",
      "Trebuchet MS",
      "Helvetica",
    ])
      for (const weight of [400, 600, 700])
        for (let value = 0; value <= 10; value++) {
          const c = document.createElement("canvas");
          c.width = 180;
          c.height = 180;
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, 180, 180);
          ctx.fillStyle = "black";
          ctx.font = `${weight} 85px "${font}"`;
          ctx.textBaseline = "middle";
          ctx.fillText(String(value), 15, 85);
          const s = shape(c);
          if (s) digitTemplates.push({ letter: String(value), shape: s });
        }
  }
  const candidates = new Map<string, number>();
  for (const template of digitTemplates) {
    let different = 0,
      union = 0;
    for (let i = 0; i < input.mask.length; i++) {
      different += Math.abs(input.mask[i] - template.shape.mask[i]);
      union += input.mask[i] || template.shape.mask[i];
    }
    const distance =
      different / Math.max(1, union) +
      0.04 * Math.abs(Math.log(input.ratio / template.shape.ratio));
    if (distance < (candidates.get(template.letter) ?? Infinity))
      candidates.set(template.letter, distance);
  }
  const sorted = [...candidates].sort((a, b) => a[1] - b[1]);
  return {
    value: Number(sorted[0][0]),
    distance: sorted[0][1],
    margin: sorted[1][1] - sorted[0][1],
  };
}
