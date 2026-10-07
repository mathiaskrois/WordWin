import release from "./ro-release.json";
import { Lexicon, solve } from "./solver";
import { normalizeWords, type Position } from "./model";
let dictionary: Lexicon | undefined;
let count = 0;
self.onmessage = async (event: MessageEvent<{ position: Position }>) => {
  try {
    // Legacy language/custom fields are deliberately never read.
    if (!dictionary) {
      self.postMessage({ type: "progress", message: "Loading Retskrivningsordbogen 5.1..." });
      const url = `${import.meta.env.BASE_URL}${release.path}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Retskrivningsordbogen could not be loaded. Connect once to download it.");
      const text = await response.text();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      if (hash !== release.sha256) {
        // Discard only this damaged generated asset, so an online retry repairs it.
        if ("caches" in self)
          for (const key of await caches.keys())
            if (key.startsWith("wordwin-shell-") || key === "wordwin-data-ro-5.1-v1")
              await (await caches.open(key)).delete(url);
        throw new Error("Dictionary verification failed. Reconnect and reload the app.");
      }
      const words = normalizeWords(text);
      if (words.length !== release.count) throw new Error("Retskrivningsordbogen is incomplete. Reconnect and reload the app.");
      count = words.length;
      dictionary = new Lexicon(words);
    }
    self.postMessage({ type: "progress", message: "Finding every legal placement..." });
    self.postMessage({ type: "result", ...solve(event.data.position, dictionary), count });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
