import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const script = readFileSync("public/shortcuts/import.js", "utf8");

test("shortcut receives a decoded image and clears the transfer data", async ({ page }) => {
  await page.goto("/wordwin/");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 750;
    canvas.height = 1624;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#223149";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const results = await page.evaluate((code) => {
    // Overlapping requests must not replace the image awaiting its receipt.
    const run = () => new Promise<string>((resolve) => {
      new Function("completion", code)(resolve);
    });
    return Promise.all([run(), run()]);
  }, script.replace('"WORDWIN_IMAGE_BASE64"', JSON.stringify(image)));
  expect(results[0]).toBe("WORDWIN_RECEIVED");
  expect(results[1]).toContain("WORDWIN_ERROR: An image is already being imported.");
  await expect(page.getByRole("button", { name: "Adjust crop" })).toBeVisible();
  expect(await page.locator("#wordwin-shortcut-data").inputValue()).toBe("");
  expect(await page.evaluate(() => Object.values(localStorage).join("")))
    .not.toContain(image);
});

test("shortcut rejects an undecodable image without acknowledging receipt", async ({ page }) => {
  await page.goto("/wordwin/");
  const result = await page.evaluate((code) => new Promise<string>((resolve) => {
    new Function("completion", code)(resolve);
  }), script.replace('"WORDWIN_IMAGE_BASE64"', '"bm90IGFuIGltYWdl"'));
  expect(result).toContain("WORDWIN_ERROR:");
  await expect(page.getByRole("button", { name: "Adjust crop" })).toHaveCount(0);
  expect(await page.locator("#wordwin-shortcut-data").inputValue()).toBe("");
});

test("shortcut rejects a stale receipt and times out without deletion acknowledgement", async ({ page }) => {
  await page.goto("/wordwin/");
  await page.evaluate(() => {
    const original = document.getElementById("wordwin-shortcut-import")!;
    original.replaceWith(original.cloneNode(true)); // No import handler responds.
    document.getElementById("wordwin-shortcut-receipt")!.textContent =
      JSON.stringify({ id: "previous-request", received: true });
  });
  const result = await page.evaluate((code) => new Promise<string>((resolve) => {
    new Function("completion", code)(resolve);
  }), script);
  expect(result).toContain("WORDWIN_ERROR: Receipt timed out.");
});

test("shortcut does not accept a page without the WordWin handoff", async ({ page }) => {
  await page.goto("/wordwin/");
  await page.locator("#wordwin-shortcut-data").evaluate((element) => element.remove());
  const result = await page.evaluate((code) => new Promise<string>((resolve) => {
    new Function("completion", code)(resolve);
  }), script);
  expect(result).toBe("WORDWIN_ERROR: Open WordWin in Safari first.");
});
