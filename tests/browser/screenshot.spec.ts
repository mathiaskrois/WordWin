import { test, expect } from "@playwright/test";
import { bonusesFor, DA_VALUES } from "../../src/model";
import type { ActivityEvent } from "../../src/activity";
const emailMode = process.env.WORDWIN_TEST_EMAIL === "1";
if (emailMode) test.use({ serviceWorkers: "block" });
test("automatically solves imported screenshots with both bonus layouts", async ({
  page,
}) => {
  const notifications: ActivityEvent[] = [];
  const prompts: string[] = [];
  if (emailMode) {
    page.on("dialog", dialog => { prompts.push(dialog.message()); void dialog.dismiss(); });
    await page.route("https://script.google.com/macros/s/**/exec", route => {
      notifications.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
    });
  }
  await page.goto("/wordwin/");
  for (const layout of ["classic", "alternate"] as const) {
    const png = await page.evaluate(
      ({ bonuses, values, layout }) => {
        const c = document.createElement("canvas");
        c.width = 750;
        c.height = 1624;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#101a29";
        ctx.fillRect(0, 0, c.width, c.height);
        const colors: Record<string, string> = {
          "": "#223149",
          DL: "#518edd",
          TL: "#305487",
          DW: "#df8841",
          TW: "#be5648",
        };
        for (let r = 0; r < 15; r++)
          for (let col = 0; col < 15; col++) {
            ctx.fillStyle = colors[bonuses[r * 15 + col]];
            ctx.fillRect(col * 50 + 2, 400 + r * 50 + 2, 46, 46);
          }
        const boardTiles =
          layout === "alternate"
            ? [
                { i: 111, l: "Æ", points: 8 },
                { i: 112, l: "Ø", points: 4 },
                { i: 113, l: "I", points: 1 },
                { i: 114, l: "Å", points: 4 },
                { i: 115, l: "A", points: 1 },
              ]
            : [];
        for (const t of boardTiles) {
          const x = (t.i % 15) * 50,
            y = 400 + Math.floor(t.i / 15) * 50;
          ctx.fillStyle = "#f0eadb";
          ctx.fillRect(x + 2, y + 2, 46, 46);
          ctx.fillStyle = "#201e1b";
          ctx.font = "32px Arial";
          // Å's ring can sit near the tile's upper edge in game screenshots.
          // Use font metrics so the ring stays inside the tile on every OS.
          const baseline = t.l === "Å"
            ? ctx.measureText(t.l).actualBoundingBoxAscent + 3
            : 40;
          ctx.fillText(t.l, x + 7, y + baseline);
          ctx.font = "bold 12px Arial";
          ctx.fillText(String(t.points), x + 38, y + 15);
        }
        const rack = "ENÅGÆFA";
        const step = 103;
        for (let i = 0; i < 7; i++) {
          const x = 15 + i * step,
            y = 1260;
          ctx.fillStyle = "#f0eadb";
          ctx.fillRect(x, y, 96, 96);
          ctx.fillStyle = "#201e1b";
          ctx.font = "65px Arial";
          const baseline = rack[i] === "Å"
            ? ctx.measureText(rack[i]).actualBoundingBoxAscent + 3
            : 78;
          ctx.fillText(rack[i], x + 12, y + baseline);
          ctx.font = "bold 22px Arial";
          ctx.fillText(String(values[rack[i]]), x + 77, y + 27);
        }
        return c.toDataURL("image/png").split(",")[1];
      },
      { bonuses: bonusesFor(layout), values: DA_VALUES, layout },
    );
    await page
      .getByLabel("Choose board screenshot")
      .setInputFiles({
        name: "generated-board.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      });
    await expect(page.getByRole("status")).toContainText("Search complete.", {
      timeout: 90000,
    });
    await expect(page.getByLabel("Rack letters", { exact: true })).toHaveValue(
      "ENÅGÆFA",
    );
    await expect(
      page.getByRole("button", {
        name: layout === "classic" ? "Board 1" : "Board 2",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    if (emailMode) {
      await expect.poll(() => notifications.length).toBe(layout === "classic" ? 1 : 2);
      const sent = notifications.at(-1)!;
      expect(sent.kind).toBe("board_import");
      expect(sent.position!.board).toHaveLength(225);
      expect(sent.position!.rack.map(t => t.letter).join("")).toBe("ENÅGÆFA");
      expect(JSON.stringify(sent)).not.toMatch(/data:image|generated-board\.png|base64/);
      expect(prompts).toEqual([]);
      expect(page.context().pages()).toHaveLength(1);
    }
    if (layout === "alternate") {
      await expect(
        page.getByRole("button", {
          name: "Row 8 column G: Æ, 8 points",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Row 8 column H: Ø, 4 points",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Row 8 column I: I, 1 points",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Row 8 column J: Å, 4 points",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Row 8 column K: A, 1 points",
          exact: true,
        }),
      ).toBeVisible();
    }
  }
});
