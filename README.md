# WordWin

An iPhone-friendly screenshot solver for two 15×15 word-game boards. Runs entirely in the browser at **https://krois.dk/WordWin/**, with English, Danish, or combined word lists.

## Use on iPhone

Open the site in Safari, choose **Share → Add to Home Screen**. Import a full screenshot containing the board and rack, review letters, tile values, blanks, and bonus squares, then select **Find best moves**. Tap a result to preview its placement. All moves are played manually in your game.

Tap a board square or rack tile to correct recognition. **Adjust crop** lets you reposition the board and rack. **Settings** contains scoring presets, editable values, center bonuses, and dictionary imports. **Help → Download for offline use** saves recognition assets and dictionaries for offline imports and solving.

Screenshots are processed on-device, never uploaded, and not persisted. Your latest reviewed position is saved in localStorage; private imported word lists are saved in IndexedDB. Clearing browser data removes both.

## Development

Requires Node.js 24 and npm. Use the committed lockfile.

```sh
npm ci
npm run dev
npm test
npm run build
npx playwright install chromium webkit
npm run test:browser
```

Development URL: `http://127.0.0.1:5173/WordWin/`. Production preview: `npm run preview`, at `http://127.0.0.1:4173/WordWin/`.

The build prepares English/Danish dictionaries, OCR workers and language data, and PNG icons from the vector icon. Generated dictionary and OCR files are ignored by Git; their versions come from `package-lock.json`. Language data comes from the upstream Tesseract fast data repository. Deployment artifacts contain local copies, with no runtime CDN dependencies.

## Rules and dictionaries

Moves must lie in one row or column without empty gaps. The first move covers the center; subsequent moves touch an existing tile. All formed words have at least two letters and must belong to the selected dictionary. Multipliers apply only to new tiles, including crossing words. Blanks score zero, and seven placed tiles earn the configured bonus (40 by default).

The first board has a double-word center by default; the second center has no bonus. Both bonus maps use horizontal/vertical reflection to restore covered squares. Visible screenshot tile values take precedence over the scoring preset; selecting a preset explicitly recalculates existing tile values. Editing the per-letter table affects newly entered tiles; existing tiles remain individually editable.

"Best" means highest immediate score for the reviewed position, rules, and selected words. The solver exhaustively traverses a compact trie with cross-word constraints; results appear only after completion. The top 20 placements are shown. Cancel terminates the worker and discards unfinished results. No opponent prediction is included.

English uses `dictionary-en-gb` (SCOWL/Aspell); Danish uses `dictionary-da` (Stavekontrolden). Hunspell affixes are expanded during the build; lowercase standalone forms of 2–15 letters are retained and normalized to uppercase without losing Æ/Ø/Å. These spelling dictionaries **are not guaranteed to match your game's dictionary**. A built-in list may miss accepted words or include words the game rejects.

Import UTF-8 `.txt` files with one word per line to replace either language's list on your device. Imported lists are normalized, deduplicated, and limited to A–Z/Æ/Ø/Å and 2–15 letters. Combined mode accepts each main and crossing word from either list and uses one scoring profile (Danish by default). Empty or invalid imports are rejected without replacing the previous list.

## Hosting and releases

WordWin source lives in `mathiaskrois/WordWin`. The existing `mathiaskrois/unbound-site` repository serves `krois.dk`; its Pages workflow builds the pinned WordWin commit and stages `dist/` at `/WordWin/`, alongside the existing Unbound pages. WordWin does not take ownership of the domain or install a root-scoped service worker.

1. Push a WordWin commit and wait for **Verify WordWin** to pass.
2. In `unbound-site`, update `wordwin-release.txt` to that full commit SHA and push. Alternatively, run **Deploy GitHub Pages** manually with `wordwin_ref` set to the full SHA.
3. The hosting workflow checks out that SHA, runs unit tests and the production build, records its SHA in `/WordWin/release.json`, then deploys the combined site.
4. Check `/WordWin/`, its manifest and recognition assets, and the existing `/unbound/` routes. Revert `wordwin-release.txt` to a previously verified SHA to roll back.

WordWin's own workflow runs unit tests and Chromium/iPhone-WebKit browser tests. Offline tests stop a real disposable HTTP origin: Playwright's WebKit `setOffline` emulation currently prevents service-worker navigation (microsoft/playwright#42775).

## Licenses and privacy

Application code: MIT. English dictionary data: MIT and BSD. Danish dictionary data: distributed under its MPL-1.1 option; unchanged dictionary/affix sources and upstream notices accompany the generated word list. OCR libraries retain their Apache-2.0 notices, and OCR language-data attribution is included in the distribution.

Reference screenshots of the unpublished game are excluded from the repository and deployment. Local validation may use them, but public automated tests use generated input and small synthetic dictionaries.
