# WordWin

An iPhone-friendly screenshot solver for two 15×15 word-game boards. Runs entirely in the browser at **https://krois.dk/wordwin/**, using only Retskrivningsordbogen 5.1.

## Use on iPhone

Open the site in Safari, choose **Share → Add to Home Screen**. Import a full screenshot containing the board and rack. WordWin calculates the best moves automatically. You can edit letters, tile values, blanks, and bonus squares afterward, then select **Find best moves** to recalculate. Tap a result to preview its placement. All moves are played manually in your game.

Tap a board square or rack tile to correct recognition. **Adjust crop** lets you reposition the board and rack. **Settings** contains scoring presets, editable values, center bonuses, and bonus settings. **Help → Download for offline use** saves recognition assets and the official dictionary for offline imports and solving.

**Strategy** recommends placements using points now, the remaining rack, sampled opponent replies, your next draw and following turn, and the risk of a large reply. **Highest score** retains exact immediate-score ranking. Results appear after the exhaustive legal search, then strategic estimates improve for up to 30 seconds. **Cancel** keeps the latest completed results. Both modes work offline and run on-device.

Screenshots are processed on-device, never uploaded, and not persisted. In database mode, anonymous browser IDs, app visits, import/calculation times, and structured board positions are sent to the activity backend when available. In Gmail mode, only successful imports are dispatched to the Google script for board emails. Board records contain letters, tile values, blanks, bonuses, scoring rules, and rack letters; no image, filename, name, email, or IP address is stored in the activity database. Your latest position is saved in localStorage. Legacy imported dictionaries and language choices are ignored. Clearing browser data removes your saved position.

## Development

Requires Node.js 24 and npm. Use the committed lockfile.

```sh
npm ci
npm run dev
npm test
npm run test:activity
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

## Gmail notifications instead of a database

For DNS-only hosting, the app can send board representations automatically through a Google Apps Script receiver running under your Gmail account. This needs no NAS or paid web hotel. Set `VITE_BOARD_EMAIL_URL` to the deployed Google script `/exec` URL when building to enable email mode instead of database logging. Users see no email window, login, permission prompt or notification: import and solving continue while the board representation is dispatched in the background. No screenshot is sent. App-open events and calculation events are not collected in email mode, and the Users page explains that notifications go to Gmail instead of a shared user database. This option has daily sending limits and cannot confirm delivery across origins.

See [the Gmail setup guide](integrations/gmail/README.md) for the one-time Google authorization, deployment steps, and delivery limits. The provided [Apps Script](integrations/gmail/Code.gs) sends only to the address configured in your private Google project; no Gmail password or token is put into the website.

## Private users page and activity service

Open `/wordwin/users/` directly to view the hidden Users page. It is omitted from app navigation and marked `noindex`. Reads require the backend admin password; hiding the URL alone does not grant access. The password is held only in page memory until you lock or reload the page, and is never included in the client build.

Each browser installation gets a random ID, reused across visits. This identifies browser installations, not named people: another browser/device or clearing site data creates a different ID. Opens, returns after more than a minute away, successful screenshot imports, crop rescans, import failures, and calculations are logged. Import and calculation events include a structured 15×15 board and rack. Calculation records include any corrections made before solving. Images remain on-device. Failed or cancelled imports do not produce board records. A bounded queue of the last 250 unsent events retries on app open, new activity, resume, or reconnect; duplicate event IDs are ignored by the server. Offline records keep their original timestamps. Users and per-user activity are paginated.

The existing GitHub Pages host cannot run the backend. **Shared collection is active only after the separate service is hosted and the frontend can reach it.** Run the dependency-free Node.js 24 service on a host with persistent disk:

```sh
ADMIN_TOKEN='<a long randomly generated password, at least 24 characters>' \
APP_ORIGIN='https://krois.dk' \
ACTIVITY_DB='/var/lib/wordwin/activity.sqlite' \
HOST='127.0.0.1' PORT='8787' \
npm run start:activity
```

Create the database parent directory first with write access for the service account. Store `ADMIN_TOKEN` as a server secret. Put the service behind an HTTPS reverse proxy. Its default routes are `POST /wordwin/api/events`, `GET /wordwin/api/users`, and `GET /wordwin/api/users/:id/events`. Reads require `Authorization: Bearer <ADMIN_TOKEN>`. All responses use `Cache-Control: no-store`, and the app service worker excludes API requests. Ingestion validates a strict JSON schema and rejects image fields and payloads over 64 KiB. The public event endpoint is anonymous telemetry; IDs and client timestamps are not verified identities. The in-memory rate limiter does not store IPs in the database; configure proxy limits appropriate to your deployment and avoid forwarding raw visitor payloads to access logs.

For the current GitHub Pages frontend, host the API on a separate HTTPS origin and build with its public URL (this URL is not a secret):

```sh
VITE_ACTIVITY_API_URL='https://your-api-host.example/wordwin/api' npm run build
```

Set that variable in the hosting repository's WordWin build step as well. `APP_ORIGIN` must exactly match the frontend origin (`https://krois.dk`, without a path or trailing slash). `API_BASE_PATH` can override the backend path if needed. Without the build variable, the frontend uses `/wordwin/api` on its own origin, which requires a reverse proxy; GitHub Pages alone cannot serve those endpoints. For local development use `APP_ORIGIN=http://127.0.0.1:5173` and `VITE_ACTIVITY_API_URL=http://127.0.0.1:8787/wordwin/api`.

Keep the SQLite file and its WAL on persistent storage and back them up with SQLite's backup tooling. Activity history is retained until the administrator removes it from the database; the browser queue is bounded independently. `npm run test:activity` verifies schema enforcement, deduplication, user isolation, authentication, CORS, and API responses. No backend credentials or deployment are provisioned by the frontend build.
