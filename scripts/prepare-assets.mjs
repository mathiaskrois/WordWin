import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  readdir,
  access,
} from "node:fs/promises";
import nspell from "nspell";
import da from "dictionary-da";
import en from "dictionary-en-gb";
import sharp from "sharp";
await mkdir("public/dictionaries", { recursive: true });
await mkdir("public/ocr", { recursive: true });
await mkdir("public/licenses", { recursive: true });
for (const [source, name] of [
  ["react/LICENSE", "react"],
  ["react-dom/LICENSE", "react-dom"],
  ["tesseract.js/LICENSE.md", "tesseract-js"],
  ["tesseract.js-core/LICENSE", "tesseract-core"],
])
  await copyFile(`node_modules/${source}`, `public/licenses/${name}.txt`);
for (const [lang, dictionary, pkg] of [
  ["en", en, "dictionary-en-gb"],
  ["da", da, "dictionary-da"],
]) {
  const path = `public/dictionaries/${lang}.txt`;
  const version = JSON.parse(
    await readFile(`node_modules/${pkg}/package.json`, "utf8"),
  ).version;
  let current = "";
  try {
    current = await readFile(`public/dictionaries/${lang}.version`, "utf8");
  } catch {}
  if (current !== version) {
    const spell = nspell(dictionary);
    const words = [
      ...new Set(
        Object.keys(spell.data)
          .filter((w) => /^[a-zæøå]{2,15}$/u.test(w) && spell.correct(w))
          .map((w) => w.normalize("NFC").toUpperCase()),
      ),
    ].sort();
    await writeFile(path, words.join("\n") + "\n");
    await writeFile(`public/dictionaries/${lang}.version`, version);
    console.log(`${lang}: ${words.length.toLocaleString()} expanded words`);
  }
  await copyFile(
    `node_modules/${pkg}/license`,
    `public/dictionaries/${lang}-license.txt`,
  );
  await copyFile(
    `node_modules/${pkg}/readme.md`,
    `public/dictionaries/${lang}-source.md`,
  );
  // Include the original dictionary and affixes with the Danish MPL distribution.
  if (lang === "da")
    for (const suffix of ["aff", "dic"])
      await copyFile(
        `node_modules/${pkg}/index.${suffix}`,
        `public/dictionaries/da-source.${suffix}`,
      );
}
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  "public/ocr/worker.min.js",
);
for (const name of await readdir("node_modules/tesseract.js-core"))
  if (name.endsWith(".wasm.js") && name.includes("lstm"))
    await copyFile(
      `node_modules/tesseract.js-core/${name}`,
      `public/ocr/${name}`,
    );
await copyFile("node_modules/tesseract.js-core/LICENSE", "public/ocr/LICENSE");
for (const lang of ["eng", "dan"]) {
  const path = `public/ocr/${lang}.traineddata.gz`;
  try {
    await access(path);
  } catch {
    const url = `https://raw.githubusercontent.com/naptha/tessdata/806cd9adc8c6e8abc11c782db1818c990576bebc/4.0.0_fast/${lang}.traineddata.gz`;
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Unable to download OCR data: ${response.status}`);
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
  }
}
const icon = await readFile("public/icon.svg");
for (const [name, size] of [
  ["apple-touch-icon", 180],
  ["icon-192", 192],
  ["icon-512", 512],
])
  await sharp(icon).resize(size, size).png().toFile(`public/${name}.png`);
await writeFile(
  "public/asset-manifest.json",
  JSON.stringify([
    ...["en", "da"].map((l) => `dictionaries/${l}.txt`),
    "ocr/worker.min.js",
    "ocr/eng.traineddata.gz",
    "ocr/dan.traineddata.gz",
    ...(await readdir("public/ocr"))
      .filter((n) => n.endsWith(".wasm.js"))
      .map((n) => `ocr/${n}`),
  ]),
);
