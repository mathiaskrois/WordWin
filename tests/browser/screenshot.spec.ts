import { test, expect } from "@playwright/test";
import { bonusesFor, DA_VALUES } from "../../src/model";
test("imports generated screenshot letters, point values and both bonus layouts", async ({
  page,
}) => {
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
              ]
            : [];
        for (const t of boardTiles) {
          const x = (t.i % 15) * 50,
            y = 400 + Math.floor(t.i / 15) * 50;
          ctx.fillStyle = "#f0eadb";
          ctx.fillRect(x + 2, y + 2, 46, 46);
          ctx.fillStyle = "#201e1b";
          ctx.font = "32px Arial";
          ctx.fillText(t.l, x + 7, y + 40);
          ctx.font = "bold 12px Arial";
          ctx.fillText(String(t.points), x + 38, y + 15);
        }
        const rack = "ENAGÆFN";
        const step = 103;
        for (let i = 0; i < 7; i++) {
          const x = 15 + i * step,
            y = 1260;
          ctx.fillStyle = "#f0eadb";
          ctx.fillRect(x, y, 96, 96);
          ctx.fillStyle = "#201e1b";
          ctx.font = "65px Arial";
          ctx.fillText(rack[i], x + 12, y + 78);
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
    await expect(page.getByRole("status")).toContainText("Read ", {
      timeout: 90000,
    });
    await expect(page.getByLabel("Rack letters", { exact: true })).toHaveValue(
      "ENAGÆFN",
    );
    await expect(
      page.getByRole("button", {
        name: layout === "classic" ? "Board 1" : "Board 2",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
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
    }
  }
});
