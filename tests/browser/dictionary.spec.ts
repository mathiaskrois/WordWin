import { test, expect } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import { initialPosition, rackFromText, tile } from "../../src/model";
const release = JSON.parse(await readFile("src/ro-release.json", "utf8"));

test("legacy overrides cannot bypass RO validation of main and crossing words", async ({ page }) => {
  const position = initialPosition(); position.rack = rackFromText("ODFHEST", position.rules.values);
  for (const [i, letter] of [..."HEST"].entries()) position.board[112 + i] = tile(letter, position.rules.values);
  await page.goto("/wordwin/");
  await page.waitForFunction(() => localStorage.getItem("wordwin-v1") !== null && navigator.serviceWorker.controller !== null);
  await page.evaluate(async (position) => {
    localStorage.setItem("wordwin-v1", JSON.stringify({position,language:"both",profile:"da",layout:"classic"}));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("wordwin-dictionaries", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("words");
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("words", "readwrite");
      tx.objectStore("words").put("ODF\nZZZ", "da"); tx.objectStore("words").put("ODF\nCAT", "en");
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
    await (await caches.open("wordwin-data-v1")).put("/wordwin/dictionaries/da.txt", new Response("ODF\nZZZ"));
  }, position);
  await page.reload();
  await expect(page.getByLabel("Rack letters", {exact:true})).toHaveValue("ODFHEST");
  await page.getByRole("checkbox", {name:"I checked the board, rack, values, and blanks."}).check();
  await page.getByRole("button", {name:"Find best moves"}).click();
  await expect(page.locator(".move").first()).toBeVisible();
  await expect(page.locator(".result-summary")).toContainText(release.count.toLocaleString("en-US"));
  const whitelist = new Set((await readFile("dist/" + release.path, "utf8")).trim().split("\n"));
  const workerPath = (await readdir("dist/assets")).find(name => name.startsWith("solver.worker-"))!;
  const result = await page.evaluate(({position, workerPath}) => new Promise<any>((resolve,reject) => {
    const worker = new Worker("/wordwin/assets/" + workerPath, {type:"module"});
    worker.onerror = e => {worker.terminate(); reject(e.message);};
    worker.onmessage = ({data}) => { if (data.type !== "progress") {worker.terminate(); resolve(data);} };
    worker.postMessage({position,language:"both",custom:{da:"ODF\nZZZ",en:"ODF\nCAT"}});
  }), {position,workerPath});
  expect(result.type).toBe("result"); expect(result.moves.length).toBeGreaterThan(0);
  expect(result.moves.some((move: any) => move.words.length > 1)).toBe(true);
  for (const move of result.moves) for (const word of move.words) {
    expect(whitelist.has(word.word), word.word).toBe(true);
    expect(word.word).not.toBe("ODF");
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wordwin-v1")!).language)).toBeUndefined();
});

test("rejects altered dictionary data rather than suggesting unverified words", async ({page}) => {
  await page.goto("/wordwin/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.evaluate(async () => {
    await (await caches.open("wordwin-data-ro-5.1-v1")).put("/wordwin/dictionaries/ro-5.1.txt", new Response("ODF\nZZZ\n"));
  });
  await page.getByLabel("Rack letters", {exact:true}).fill("ODF");
  await page.getByRole("checkbox", {name:"I checked the board, rack, values, and blanks."}).check();
  await page.getByRole("button", {name:"Find best moves"}).click();
  await expect(page.getByRole("alert")).toContainText("Dictionary verification failed");
  await expect(page.locator(".move")).toHaveCount(0);
  // A retry fetches the verified source after discarding the corrupt cache entry.
  await page.getByRole("button", {name:"Find best moves"}).click();
  await expect(page.getByRole("status")).toContainText("Search complete.");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
