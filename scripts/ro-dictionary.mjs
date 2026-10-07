export const SOURCE = "https://ordregister.dk/files/cor1.5.1.0.tsv";
export const SOURCE_SHA256 = "1c4d1c06bd676e66be8e8c0af68615c8a892472a05af3b261ba8a9d1f2d2b82b";
export const DICTIONARY_PATH = "dictionaries/ro-5.1.txt";

/** COR1: id, lemma, gloss, grammar, exact form, normering.
 * N is explicitly in RO; K/U and generated affixes are never accepted.
 */
export function parseCOR(text) {
  const words = new Set();
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line) continue;
    const columns = line.split("\t");
    if (columns.length !== 6 || !/^COR\.\d+\.\d+\.\d+$/.test(columns[0]) ||
        !["N", "K", "U"].includes(columns[5]))
      throw new Error("Unexpected COR schema or normering. Refusing to guess word validity.");
    if (columns[5] !== "N") continue;
    const form = columns[4].normalize("NFC");
    if (/^[a-zA-ZÆæØøÅå]{2,15}$/u.test(form)) words.add(form.toUpperCase());
  }
  return [...words].sort();
}
