import { test, expect } from "@playwright/test";

// WebKit cannot route mocked API requests once a service worker controls the page.
// The app suite separately verifies the real service worker and offline navigation.
test.use({ serviceWorkers: "block" });

test("anonymous identity survives reload and opening Users is not recorded as app usage", async ({ page }) => {
  const events: any[] = [];
  await page.route("**/wordwin/api/events", route => {
    events.push(...route.request().postDataJSON().events);
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/wordwin/");
  await expect.poll(() => events.length).toBe(1);
  expect(events[0].kind).toBe("open");
  expect(events[0].position).toBeUndefined();
  await page.reload();
  await expect.poll(() => events.length).toBe(2);
  expect(events[1].userId).toBe(events[0].userId);
  expect(events[1].sessionId).not.toBe(events[0].sessionId);
  await page.goto("/wordwin/users/");
  await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
  expect(events).toHaveLength(2);
});

test("private Users page unlocks, displays a board representation, and locks again", async ({ page }) => {
  const userId = "10101010-1010-4010-8010-101010101010";
  const board = Array(225).fill(null);
  board[112] = { letter: "Ø", blank: true, value: 0 };
  const at = "2026-01-01T12:00:00.000Z";
  await page.route("**/wordwin/api/users**", route => {
    if (route.request().headers().authorization !== "Bearer test-admin-password")
      return route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    if (route.request().url().includes("/events"))
      return route.fulfill({ json: { nextOffset: null, events: [{
        id: "20202020-2020-4020-8020-202020202020", userId, sessionId: userId, at, receivedAt: at, kind: "board_import",
        position: { board, rack: [{ letter: "Æ", blank: false, value: 4 }], bonuses: Array(225).fill(""), rules: { values: { Æ: 4 }, bingo: 40, center: "" } },
      }] } });
    return route.fulfill({ json: { nextOffset: null, users: [{ id: userId, firstSeen: at, lastSeen: at, visits: 2, imports: 1, solves: 1 }] } });
  });
  await page.goto("/wordwin/users/");
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByLabel("Admin password").fill("wrong-password");
  await page.getByRole("button", { name: "Unlock users" }).click();
  await expect(page.getByRole("alert")).toHaveText("Incorrect admin password.");
  await page.getByLabel("Admin password").fill("test-admin-password");
  await page.getByRole("button", { name: "Unlock users" }).click();
  await page.getByRole("button", { name: "10101010", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Imported board" })).toBeVisible();
  await expect(page.locator(".logged-board span")).toHaveCount(225);
  await expect(page.locator(".logged-board .occupied")).toHaveText("ø");
  await expect(page.getByText("Rack: Æ.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("test-admin-password");
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(page.getByLabel("Admin password")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.locator(".logged-board")).toHaveCount(0);
});
