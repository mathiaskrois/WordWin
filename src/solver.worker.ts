import { Lexicon, solve } from "./solver";
import { normalizeWords, type Language, type Position } from "./model";
const dictionaries = new Map<string, string[]>();
self.onmessage = async (
  event: MessageEvent<{
    position: Position;
    language: Language;
    custom: Partial<Record<"en" | "da", string>>;
  }>,
) => {
  try {
    const { position, language, custom } = event.data;
    const languages =
      language === "both"
        ? (["en", "da"] as const)
        : ([language] as ("en" | "da")[]);
    const sets: Record<string, Set<string>> = {};
    for (const lang of languages) {
      self.postMessage({
        type: "progress",
        message: `Loading ${lang === "en" ? "English" : "Danish"} words…`,
      });
      let words: string[];
      if (custom[lang] !== undefined) words = normalizeWords(custom[lang]!);
      else {
        if (!dictionaries.has(lang)) {
          const response = await fetch(
            `${import.meta.env.BASE_URL}dictionaries/${lang}.txt`,
          );
          if (!response.ok)
            throw new Error(
              "Word list could not be loaded. Connect once to download it, or import a word list.",
            );
          dictionaries.set(lang, normalizeWords(await response.text()));
        }
        words = dictionaries.get(lang)!;
      }
      sets[lang] = new Set(words);
    }
    self.postMessage({
      type: "progress",
      message: "Finding every legal placement…",
    });
    const result = solve(
      position,
      new Lexicon(Object.values(sets).flatMap((s) => [...s])),
    );
    for (const move of result.moves)
      for (const word of move.words)
        word.language =
          sets.en?.has(word.word) && sets.da?.has(word.word)
            ? "both"
            : sets.en?.has(word.word)
              ? "en"
              : "da";
    self.postMessage({
      type: "result",
      ...result,
      count: new Set(Object.values(sets).flatMap((s) => [...s])).size,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
