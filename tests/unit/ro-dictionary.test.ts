import { describe, it, expect, vi, afterEach } from "vitest";
import { parseCOR } from "../../scripts/ro-dictionary.mjs";
import { load, STORE } from "../../src/storage";
import { initialPosition, rackFromText } from "../../src/model";
const row = (form: string, status = "N", lemma = "irrelevant") =>
  `COR.00001.110.01\t${lemma}\t\tsb\t${form}\t${status}`;
afterEach(() => vi.unstubAllGlobals());
describe("official RO-only word forms", () => {
  it("accepts only N exact forms, not lemmas or inferred K/U inflections", () => {
    expect(parseCOR([row("heste", "N", "hest"), row("hestes", "K"), row("hestefod", "U"), row("heste")].join("\n"))).toEqual(["HESTE"]);
  });
  it("preserves Danish letters and NFC without inventing words from fragments", () => {
    expect(parseCOR(["\uFEFF" + row("\u00e6g"),row("\u00f8l"),row("a\u030al"),row("AE"),row("a-b"),row("to ord"),row("ord."),row("caf\u00e9"),row("gro\u00df"),row("a"),row("a".repeat(16))].join("\r\n"))).toEqual(["AE", "\u00c5L", "\u00c6G", "\u00d8L"].sort());
  });
  it("rejects unknown schemas and old normering instead of guessing", () => {
    expect(() => parseCOR(row("hest", "1"))).toThrow(/schema/);
    expect(() => parseCOR("<html>Download failed</html>")).toThrow(/schema/);
    expect(() => parseCOR(row("hest") + "\textra")).toThrow(/schema/);
  });
  it("preserves the saved board and rack while discarding old language/custom overrides", () => {
    const position = initialPosition(); position.rack = rackFromText("HEST", position.rules.values);
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === STORE ? JSON.stringify({position, language:"both", custom:{da:"ZZZ"}, layout:"alternate",profile:"da"}) : null });
    expect(load()).toEqual({position,layout:"alternate",profile:"da",resultsTab:"strategy"});
    expect(load()).not.toHaveProperty("language");
    expect(load()).not.toHaveProperty("custom");
  });
});
