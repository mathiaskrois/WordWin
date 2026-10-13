import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
test("solving, preview, persistent position and no mobile overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/wordwin/");
  await expect(
    page.getByRole("heading", { name: "Make every letter count." }),
  ).toBeVisible();
  await expect(page.locator(".square")).toHaveCount(225);
  await page.getByLabel("Rack letters", { exact: true }).fill("ENAGÆFN");
  const solve = page.getByRole("button", { name: "Find best moves" });
  await expect(solve).toBeEnabled();
  await solve.click();
  await expect(page.locator(".move").first()).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".square.proposed")).not.toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Rack letters", { exact: true })).toHaveValue(
    "ENAGÆFN",
  );
  await expect(solve).toBeEnabled();
  expect(errors).toEqual([]);
});
test("square correction, blank values, settings and fixed official dictionary", async ({
  page,
}) => {
  await page.goto("/wordwin/");
  await page
    .getByRole("button", { name: "Row 8 column H:", exact: false })
    .click();
  await page.getByLabel("Letter", { exact: true }).fill("Ø");
  await page.getByLabel("Blank tile (0 points)", { exact: false }).check();
  await page.getByRole("button", { name: "Save square" }).click();
  await expect(
    page.getByRole("button", { name: "Row 8 column H: Ø blank, 0 points" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear position" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Retskrivningsordbogen 5.1" })).toBeVisible();
  await expect(page.getByLabel("Import English dictionary")).toHaveCount(0);
  await expect(page.getByLabel("Import Danish dictionary")).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("button", { name: "Combined", exact: true })).toHaveCount(0);
  await page.getByLabel("Rack letters", { exact: true }).fill("ÆG");
  await page.getByRole("button", { name: "Find best moves" }).click();
  await expect(page.locator(".move").first()).toBeVisible();
  expect(
    await page.locator(".move-details strong").allTextContents(),
  ).toContain("ÆG");
  if (await page.getByRole("button", { name: "Cancel", exact: true }).count())
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Board 2", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Find best moves" }),
  ).toBeEnabled();
});
test("offline reload and solving after origin server stops, with scoped service worker", async ({
  page,
}) => {
  // Stopping a real origin also tests WebKit: Playwright setOffline currently
  // rejects SW navigation before dispatch (microsoft/playwright#42775).
  const root = resolve("dist");
  const types: Record<string, string> = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".txt": "text/plain",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, "http://localhost");
      const relative =
        decodeURIComponent(url.pathname).replace(/^\/wordwin\//, "") ||
        "index.html";
      const path = resolve(root, relative);
      if (!path.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(path);
      res.setHeader(
        "Content-Type",
        types[path.slice(path.lastIndexOf("."))] || "application/octet-stream",
      );
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await page.goto(origin + "/wordwin/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.getByLabel("Rack letters", { exact: true }).fill("HEST");
    await page.getByRole("button", { name: "Find best moves" }).click();
    await expect(page.locator(".move").first()).toBeVisible();
    expect(
      await page.evaluate(
        async () => (await navigator.serviceWorker.getRegistration())?.scope,
      ),
    ).toBe(origin + "/wordwin/");
    await new Promise<void>((r) => {
      server.close(() => r());
      server.closeAllConnections();
    });
    await page.reload();
    await expect(page.getByLabel("Rack letters", { exact: true })).toHaveValue(
      "HEST",
    );
    await page.getByRole("button", { name: "Find best moves" }).click();
    await expect(page.locator(".move").first()).toBeVisible();
  } finally {
    if (server.listening) {
      server.close();
      server.closeAllConnections();
    }
  }
});
