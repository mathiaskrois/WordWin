import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const assets = await readdir("dist/assets");
const paths = [
  "",
  "index.html",
  "icon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "manifest.webmanifest",
  "asset-manifest.json",
  ...assets.map((a) => "assets/" + a),
];
await writeFile("dist/build-assets.json", JSON.stringify(paths));
let digest = createHash("sha256");
for (const path of paths.filter(Boolean))
  digest.update(await readFile("dist/" + path));
const version = digest.digest("hex").slice(0, 12);
await writeFile(
  "dist/sw.js",
  (await readFile("dist/sw.js", "utf8")).replace("__BUILD__", version),
);
console.log("Offline app version: " + version);
