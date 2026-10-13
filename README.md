# WordWin

An iPhone-friendly screenshot solver for two 15×15 word-game boards. Runs entirely in the browser at **https://krois.dk/wordwin/**, using only Retskrivningsordbogen 5.1.

## Use on iPhone

Open the site in Safari, choose **Share → Add to Home Screen**. Import a full screenshot containing the board and rack. WordWin calculates the best moves automatically. You can edit letters, tile values, blanks, and bonus squares afterward, then select **Find best moves** to recalculate. Tap a result to preview its placement. All moves are played manually in your game.

Tap a board square or rack tile to correct recognition. **Adjust crop** lets you reposition the board and rack. **Settings** contains scoring presets, editable values, center bonuses, and bonus settings. **Help → Download for offline use** saves recognition assets and the official dictionary for offline imports and solving.

**Strategy** recommends placements using points now, the remaining rack, sampled opponent replies, your next draw and following turn, and the risk of a large reply. **Highest score** retains exact immediate-score ranking. Results appear after the exhaustive legal search, then strategic estimates improve for up to 30 seconds. **Cancel** keeps the latest completed results. Both modes work offline and run on-device.

Screenshots are processed on-device, never uploaded, and not persisted. Your latest position is saved in localStorage. Legacy imported dictionaries and language choices are ignored. Clearing browser data removes your saved position.

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

Development URL: `http://127.0.0.1:5173/wordwin/`. Production preview: `npm run preview`, at `http://127.0.0.1:4173/wordwin/`.

The build prepares the official RO dictionary, OCR workers and language data, and PNG icons from the vector icon. Generated dictionary and OCR files are ignored by Git; the COR source is pinned by version and SHA-256 in `scripts/ro-dictionary.mjs`. The generated list is independently pinned in `src/ro-release.json`; build and worker reject a checksum mismatch. Language data comes from the upstream Tesseract fast data repository. Deployment artifacts contain local copies, with no runtime CDN dependencies.

## Rules and dictionaries

Moves must lie in one row or column without empty gaps. The first move covers the center; subsequent moves touch an existing tile. All formed words have at least two letters and must belong to Retskrivningsordbogen 5.1. Multipliers apply only to new tiles, including crossing words. Blanks score zero, and seven placed tiles earn the configured bonus (40 by default).

The first board has a double-word center by default; the second center has no bonus. Both bonus maps use horizontal/vertical reflection to restore covered squares. Visible screenshot tile values take precedence over the scoring preset; selecting a preset explicitly recalculates existing tile values. Editing the per-letter table affects newly entered tiles; existing tiles remain individually editable.

**Highest score** means highest immediate score for the reviewed position, rules, and the RO whitelist. The solver exhaustively traverses a compact trie with cached cross-word constraints. **Strategy** compares up to 12 distinct candidates drawn from immediate-score, remaining-rack, and bonus-opening evaluations. It simulates an opponent reply and your following turn with the same hidden racks and draw sequences for every candidate. Only fully completed comparison rounds affect rankings.

The strategic value is estimated net points across those turns plus final rack-quality difference, minus 25% of the opponent's 90th-percentile reply above their mean reply. Initial rack estimates reward retained blanks (+8), penalize extra copies of letters (-2), and penalize deviation from a 40% vowel balance (-1.5 per letter). These versioned heuristic weights are initial estimates, not a trained Danish leave table. Bonus exposure screens straight-line empty paths to nearby unused premiums; simulations evaluate actual legal replies. Fewer than eight completed scenarios is labelled limited analysis.

The unseen pool uses the [official Danish Wordfeud distribution](https://wordfeud.com/wfweb/help/) of 104 tiles, subtracting board tiles and your rack. Played blanks remain physical blanks. Opponent racks are uniformly sampled without replacement, assuming seven tiles when available; future draws consume the remaining pool. The simulated opponent chooses points plus rack quality. Bag-empty simulations apply remaining-tile deductions and going-out transfers. With screenshot-only input, actual opponent letters, scores, exchanges, and playing style are unknown; these are approximate point-advantage estimates, not win probabilities or a proof of the strongest possible move. Only placements are recommended. Inconsistent physical tile counts disable strategy while keeping exact scoring available; correct the recognition to restore analysis.

The source is Dansk Sprognaevn's [COR1 1.5.1.0](https://ordregister.dk/), corresponding to **Retskrivningsordbogen 5.1**. Use only column 5 (exact word form) where column 6 is **N** (normeret). Exclude U (unnormeret) and K (not explicitly normeret, including inferred noun genitives), and all COR2 extensions. No Hunspell expansion or inferred compounds are used.

Keep 2-15 letters from A-Z and Danish AE/OE/AA, NFC-normalized and uppercased. Punctuation, accents outside the tile alphabet, hyphenated fragments and multiword expressions are excluded, never stripped into invented words. This yields **215,705** unique forms. Each main word and every crossing word must pass the same whitelist. The version and source are shown in Settings and `dictionaries/ro-metadata.json`. If the game uses a different RO edition or additional house rules, those still need to match.

The official source is [freely available for all purposes](https://dsn.dk/forskning/sprogteknologi-og-fagsprog/cor/). The original TSV is included in the deployment for reproducibility. The app never queries an external dictionary while solving.

## Hosting and releases

WordWin source lives in `mathiaskrois/WordWin`. The existing `mathiaskrois/krois-site` repository serves `krois.dk`; its Pages workflow builds the pinned WordWin commit and stages `dist/` at `/wordwin/` and the legacy redirect from `hosting/WordWin/` at `/WordWin/`, alongside the existing Unbound pages. WordWin does not take ownership of the domain or install a root-scoped service worker.

1. Push a WordWin commit and wait for **Verify WordWin** to pass.
2. In sibling `krois-site`, update only `WordWin.commit` in `releases.json` to that full commit SHA and push. **Deploy GitHub Pages** assembles the three separately pinned website releases.
3. The hosting workflow checks out that SHA, runs unit tests and the production build, records its SHA in `/wordwin/release.json`, then deploys the combined site.
4. Check `/wordwin/`, its manifest and recognition assets, and the existing `/unbound/` routes. Revert `wordwin-release.txt` to a previously verified SHA to roll back.

WordWin's own workflow runs unit tests and Chromium/iPhone-WebKit browser tests. Offline tests stop a real disposable HTTP origin: Playwright's WebKit `setOffline` emulation currently prevents service-worker navigation (microsoft/playwright#42775).

## Licenses and privacy

Application code: MIT. Dictionary source: Dansk Sprognaevn COR1; freely available for all purposes with attribution and original data included. OCR libraries retain their Apache-2.0 notices, and OCR language-data attribution is included in the distribution.

Reference screenshots of the unpublished game are excluded from the repository and deployment. Local validation may use them, but public automated tests use generated input and small synthetic dictionaries.

The local checkout is grouped at `/Users/mathiaskroismoller/Git/krois/WordWin/`. Website source repositories are siblings; the Unbound app stays independently at `/Users/mathiaskroismoller/Git/Unbound/`.
