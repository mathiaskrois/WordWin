import { useEffect, useRef, useState } from "react";
import {
  ALPHABET,
  DA_VALUES,
  EN_VALUES,
  bonusesFor,
  emptyBoard,
  rackFromText,
  tile,
  type Bonus,
  type Position,
} from "./model";
import { detectBoard, type Crop } from "./vision";
import { imageCanvas, recognize } from "./recognition";
import { load, STORE } from "./storage";
import { moveKey, type Analysis, type StrategicMove } from "./strategy";
import type { SolverMessage } from "./solver.worker";
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function recommendationReasons(move: StrategicMove, highest?: StrategicMove): string {
  if (highest && move.score < highest.score) {
    const a = move.strategy, b = highest.strategy;
    const reasons: { benefit: number; text: string }[] = [
      { benefit: a.rackQuality - b.rackQuality, text: "Keeps a more balanced, flexible rack." },
      { benefit: b.exposure - a.exposure, text: "Opens fewer nearby bonus opportunities." },
    ];
    if (a.samples && b.samples) reasons.push(
      { benefit: (b.opponentMean ?? 0) - (a.opponentMean ?? 0), text: "Allows a smaller estimated opponent reply." },
      { benefit: (a.nextMean ?? 0) - (b.nextMean ?? 0), text: "Sets up a stronger estimated next turn." },
      { benefit: (b.replyP90 ?? 0) - (a.replyP90 ?? 0), text: "Reduces the risk of a large opponent reply." },
    );
    const positive = reasons.filter(r => r.benefit > 0.1).sort((a, b) => b.benefit - a.benefit).slice(0, 2);
    return `${highest.score - move.score} fewer points now than ${highest.word}. ${positive.map(r => r.text).join(" ") || "Compare the overall projected advantage and remaining letters."}`;
  }
  return move.strategy.samples
    ? "Projected advantage combines points now, both following turns, final rack quality, and large-reply risk."
    : "Initial estimate balances points, retained blanks, repeated letters, vowel balance, and nearby bonus openings.";
}
export default function App() {
  const saved = useRef(load()).current;
  const [position, setPosition] = useState<Position>(saved.position),
    [layout, setLayout] = useState(saved.layout),
    [profile, setProfile] = useState(saved.profile);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<"import" | "solve" | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null),
    [resultsTab, setResultsTab] = useState(saved.resultsTab),
    [selected, setSelected] = useState<string | null>(null),
    [stopped, setStopped] = useState(false),
    [solved, setSolved] = useState(false),
    [summary, setSummary] = useState("");
  const [modal, setModal] = useState<"settings" | "crop" | "help" | null>(null),
    [edit, setEdit] = useState<{
      kind: "board" | "rack";
      index: number;
    } | null>(null);
  const [editLetter, setEditLetter] = useState(""),
    [editBlank, setEditBlank] = useState(false),
    [editValue, setEditValue] = useState(1),
    [editBonus, setEditBonus] = useState<Bonus>("");
  const [uncertain, setUncertain] = useState<number[]>([]),
    [rackUncertain, setRackUncertain] = useState<number[]>([]);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null),
    [imageUrl, setImageUrl] = useState(""),
    [crop, setCrop] = useState<Crop | null>(null);
  const [offline, setOffline] = useState(""),
    [downloading, setDownloading] = useState(false);
  const worker = useRef<Worker | null>(null),
    abort = useRef<AbortController | null>(null),
    job = useRef(0),
    dialog = useRef<HTMLDialogElement>(null),
    upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, {
          scope: import.meta.env.BASE_URL,
        })
        .catch(() => {});
    return () => {
      worker.current?.terminate();
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        STORE,
        JSON.stringify({ position, layout, profile, resultsTab }),
      );
    } catch {
      /* Solving remains available when storage is full. */
    }
  }, [position, layout, profile, resultsTab]);
  useEffect(() => {
    if (modal || edit) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal, edit]);
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );
  function invalidate() {
    job.current++;
    worker.current?.terminate();
    worker.current = null;
    setAnalysis(null);
    setSelected(null);
    setStopped(false);
    setSolved(false);
    setSummary("");
    setError("");
  }
  function cancel() {
    job.current++;
    worker.current?.terminate();
    worker.current = null;
    abort.current?.abort();
    setBusy(null);
    setStopped(!!analysis);
    setMessage(analysis ? "Analysis stopped. Latest recommendations retained." : "Cancelled. Review the position and try again.");
  }
  async function scan(source: HTMLCanvasElement, manual?: Crop) {
    invalidate();
    const id = ++job.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy("import");
    setError("");
    setMessage("Locating the board…");
    try {
      const result = await recognize(
        source,
        (s) => {
          if (id === job.current) setMessage(s);
        },
        controller.signal,
        manual,
      );
      if (id !== job.current) return;
      const nextPosition: Position = {
        ...position,
        board: result.board,
        rack: result.rack,
        bonuses: result.bonuses,
        rules: { ...position.rules, center: result.bonuses[112] },
      };
      setPosition(nextPosition);
      setLayout(result.layout);
      setCrop(result.crop);
      setUncertain(result.uncertain);
      setRackUncertain(result.rackUncertain);
      setMessage(
        `Read ${result.board.filter(Boolean).length} board tiles and ${result.rack.length} rack tiles. Calculating your best moves.`,
      );
      if (!result.rack.length)
        setError(
          "No rack tiles found. Adjust the crop or enter your rack below.",
        );
      else findMoves(nextPosition);
    } catch (e) {
      if (id === job.current)
        setError(
          `Screenshot could not be read: ${errorMessage(e)}. You can adjust the crop or enter tiles manually.`,
        );
    } finally {
      if (id === job.current && !worker.current) setBusy(null);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      const source = await imageCanvas(file);
      setCanvas(source);
      setImageUrl(URL.createObjectURL(file));
      const found = detectBoard(
        source
          .getContext("2d")!
          .getImageData(0, 0, source.width, source.height),
      );
      setCrop(found.crop);
      await scan(source);
    } catch (e) {
      setError(
        `Unable to open this image: ${errorMessage(e)}. Use a PNG or JPEG screenshot.`,
      );
    }
  }
  function changeLayout(next: "classic" | "alternate") {
    setLayout(next);
    invalidate();
    const center = next === "classic" ? "DW" : "";
    setPosition((p) => ({
      ...p,
      bonuses: bonusesFor(next),
      rules: { ...p.rules, center },
    }));
  }
  function changeProfile(next: "da" | "en") {
    setProfile(next);
    const values = { ...(next === "da" ? DA_VALUES : EN_VALUES) };
    setPosition((p) => ({
      ...p,
      rules: { ...p.rules, values },
      rack: p.rack.map((t) => tile(t.letter, values, t.blank)),
      board: p.board.map((t) => (t ? tile(t.letter, values, t.blank) : null)),
    }));
    invalidate();
  }
  function openTile(kind: "board" | "rack", index: number) {
    const t = kind === "board" ? position.board[index] : position.rack[index];
    setEdit({ kind, index });
    setEditLetter(t?.letter === "?" ? "" : (t?.letter ?? ""));
    setEditBlank(t?.blank ?? false);
    setEditValue(t?.value ?? 1);
    setEditBonus(kind === "board" ? position.bonuses[index] : "");
  }
  function commitTile(remove = false) {
    if (!edit) return;
    const letter = editLetter.toUpperCase().normalize("NFC");
    if (!remove && letter && !ALPHABET.includes(letter)) {
      setError("Choose a single letter, including Æ, Ø, or Å.");
      return;
    }
    if (!remove && edit.kind === "board" && editBlank && !letter) {
      setError("Choose the letter represented by the board blank.");
      return;
    }
    const nextTile = remove
      ? null
      : letter || editBlank
        ? {
            letter: letter || (editBlank ? "?" : ""),
            value: editBlank ? 0 : editValue,
            blank: editBlank,
          }
        : null;
    setPosition((p) => {
      if (edit.kind === "rack") {
        const rack = p.rack.slice();
        if (nextTile) rack[edit.index] = nextTile;
        else rack.splice(edit.index, 1);
        return { ...p, rack };
      }
      const board = p.board.slice(),
        bonuses = p.bonuses.slice();
      board[edit.index] = nextTile;
      bonuses[edit.index] = editBonus;
      return {
        ...p,
        board,
        bonuses,
        rules: edit.index === 112 ? { ...p.rules, center: editBonus } : p.rules,
      };
    });
    if (edit.kind === "board")
      setUncertain((u) => u.filter((i) => i !== edit.index));
    else setRackUncertain((u) => u.filter((i) => i !== edit.index));
    setEdit(null);
    invalidate();
  }
  function findMoves(nextPosition: Position = position) {
    if (!nextPosition.rack.length) return;
    const invalid =
      nextPosition.board.some((t) => t && !ALPHABET.includes(t.letter)) ||
      nextPosition.rack.some((t) => !t.blank && !ALPHABET.includes(t.letter));
    if (invalid) {
      setBusy(null);
      setError(
        "Correct the tiles marked ? before solving. Rack blanks can remain ?.",
      );
      return;
    }
    const id = ++job.current;
    setError("");
    setAnalysis(null);
    setSelected(null);
    setStopped(false);
    setSolved(false);
    setBusy("solve");
    setMessage("Preparing the solver…");
    worker.current?.terminate();
    const w = new Worker(new URL("./solver.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e: MessageEvent<SolverMessage>) => {
      if (id !== job.current) return;
      const result = e.data;
      if (result.type === "progress") setMessage(result.message);
      else if (result.type === "error") {
        setBusy(null);
        setStopped(true);
        w.terminate();
        worker.current = null;
        setError(result.message);
      } else {
        setAnalysis(result);
        setSolved(true);
        // Follow the recommendation until the user selects a placement.
        // Explicit selections remain stable as rankings improve.
        setSummary(`${result.examined.toLocaleString()} valid placements checked · ${result.count.toLocaleString()} words`);
        if (result.type === "result") {
          setBusy(null);
          w.terminate();
          worker.current = null;
          setMessage("Search complete.");
        } else setMessage(`Analyzing possible replies and your next turn… ${result.rounds} comparison rounds`);
      }
    };
    w.onerror = () => {
      if (id === job.current) {
        setBusy(null);
        setStopped(true);
        setError(
          "The solver stopped unexpectedly. Reload the app and try again.",
        );
        w.terminate();
        worker.current = null;
      }
    };
    w.postMessage({ position: nextPosition });
  }
  async function downloadOffline() {
    setDownloading(true);
    setOffline("Downloading the dictionary and recognition files…");
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}asset-manifest.json`,
      );
      if (!response.ok) throw new Error("Asset list unavailable.");
      const assets: string[] = await response.json();
      const cache = await caches.open("wordwin-data-ro-5.1-v1");
      for (let i = 0; i < assets.length; i++) {
        await cache.add(`${import.meta.env.BASE_URL}${assets[i]}`);
        setOffline(`Saving offline files ${i + 1} of ${assets.length}…`);
      }
      setOffline("Ready for offline screenshot imports and solving.");
    } catch {
      setOffline("Download incomplete. Reconnect and try again.");
    } finally {
      setDownloading(false);
    }
  }
  const moves = resultsTab === "strategy" && analysis?.strategyMoves.length
    ? analysis.strategyMoves : analysis?.pointsMoves ?? [];
  const active = moves.find(m => moveKey(m) === selected) ?? moves[0];
  const strategic = active && analysis?.strategyMoves.find(m => moveKey(m) === moveKey(active));
  const highest = analysis?.pointsMoves[0];
  const limited = !analysis?.rounds || analysis.rounds < 8;
  const analysisLabel = busy === "solve" ? "Analyzing" : stopped ? `Analysis stopped${limited ? " · Limited analysis" : ""}` : limited ? "Limited analysis" : "Analysis complete";
  const overlay = new Map(active?.placed.map((p) => [p.index, p]) ?? []);
  const unknown = position.board.some((t) => t?.letter === "?");
  return (
    <div className="app">
      <header>
        <a className="brand" href={import.meta.env.BASE_URL}>
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
          <span>
            WordWin<span className="brand-dot">.</span>
          </span>
        </a>
        <button
          className="icon-button"
          aria-label="Help and iPhone installation"
          onClick={() => setModal("help")}
        >
          ?
        </button>
      </header>
      <main>
        <section className="intro">
          <div className="eyebrow">
            <span className="live-dot" /> YOUR NEXT MOVE
          </div>
          <h1>Make every letter count.</h1>
          <p>A screenshot. Your letters. Your strongest next move.</p>
        </section>
        <div className="workspace">
          <section
            className="board-panel"
            aria-label="Game board and screenshot import"
          >
            <div className="upload-row">
              <button
                className="upload-button"
                disabled={!!busy}
                onClick={() => upload.current?.click()}
              >
                <span aria-hidden="true">↥</span> Import screenshot
              </button>
              <input
                ref={upload}
                aria-label="Choose board screenshot"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  void importFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {canvas && (
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => setModal("crop")}
                >
                  Adjust crop
                </button>
              )}
            </div>
            <div className="board-toolbar">
              <div className="segmented" aria-label="Board layout">
                {(["classic", "alternate"] as const).map((l, i) => (
                  <button
                    key={l}
                    disabled={!!busy}
                    aria-pressed={layout === l}
                    onClick={() => changeLayout(l)}
                  >
                    Board {i + 1}
                  </button>
                ))}
              </div>
              <span className="tiny">Tap a square to edit</span>
            </div>
            <div className="board-with-coordinates">
              <div className="col-labels">
                {Array.from({ length: 15 }, (_, i) => (
                  <span key={i}>{String.fromCharCode(65 + i)}</span>
                ))}
              </div>
              <div className="board-body">
                <div className="row-labels">
                  {Array.from({ length: 15 }, (_, i) => (
                    <span key={i}>{i + 1}</span>
                  ))}
                </div>
                <div className="board" role="group" aria-label="15 by 15 board">
                  {position.board.map((t, i) => {
                    const added = overlay.get(i),
                      bonus = position.bonuses[i];
                    return (
                      <button
                        key={i}
                        disabled={!!busy}
                        className={`square ${t ? "occupied" : bonus || "normal"} ${added ? "proposed" : ""} ${uncertain.includes(i) ? "uncertain" : ""}`}
                        aria-label={`Row ${Math.floor(i / 15) + 1} column ${String.fromCharCode(65 + (i % 15))}: ${t ? `${t.letter}${t.blank ? " blank" : ""}, ${t.value} points` : bonus || "empty"}${added ? `, proposed ${added.letter}` : ""}`}
                        onClick={() => openTile("board", i)}
                      >
                        {t || added ? (
                          <>
                            <span className="tile-letter">
                              {(t || added)!.letter}
                            </span>
                            <sup>{(t || added)!.value}</sup>
                            {(t || added)!.blank && <i className="blank-dot" />}
                          </>
                        ) : i === 112 ? (
                          <span className="star">★</span>
                        ) : (
                          <span className="bonus-label">{bonus}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="legend">
              <span>
                <i className="DL" /> Double letter
              </span>
              <span>
                <i className="TL" /> Triple letter
              </span>
              <span>
                <i className="DW" /> Double word
              </span>
              <span>
                <i className="TW" /> Triple word
              </span>
            </div>
            <div className="rack-heading">
              <h2>Your rack</h2>
              <span className="tiny">? = blank · tap to edit points</span>
            </div>
            <div className="rack">
              {Array.from({ length: 7 }, (_, i) => {
                const t = position.rack[i];
                return (
                  <button
                    key={i}
                    disabled={!!busy}
                    className={`rack-tile ${t ? "" : "empty"} ${rackUncertain.includes(i) ? "uncertain" : ""}`}
                    aria-label={`Rack tile ${i + 1}${t ? `: ${t.blank ? "blank" : t.letter}, ${t.value} points` : ": empty"}`}
                    onClick={() => openTile("rack", i)}
                  >
                    {t ? (
                      <>
                        <span>{t.letter}</span>
                        <sup>{t.value}</sup>
                      </>
                    ) : (
                      <span className="rack-plus">+</span>
                    )}
                  </button>
                );
              })}
            </div>
            <label className="rack-input">
              <span>Or type your letters</span>
              <input
                aria-label="Rack letters"
                value={position.rack
                  .map((t) => (t.blank ? "?" : t.letter))
                  .join("")}
                placeholder="e.g. ENAGÆFN"
                maxLength={7}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                disabled={!!busy}
                onChange={(e) => {
                  setPosition((p) => ({
                    ...p,
                    rack: rackFromText(e.target.value, p.rules.values),
                  }));
                  setRackUncertain([]);
                  invalidate();
                }}
              />
            </label>
            <button
              className="text-button clear"
              disabled={!!busy}
              onClick={() => {
                setPosition((p) => ({ ...p, board: emptyBoard(), rack: [] }));
                setUncertain([]);
                setRackUncertain([]);
                invalidate();
                setMessage("Board cleared.");
              }}
            >
              Clear position
            </button>
          </section>
          <aside className="analysis-panel">
            <section className="solve-card">
              <div className="section-heading">
                <h2>Find your best move</h2>
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => setModal("settings")}
                >
                  Settings <span aria-hidden="true">↗</span>
                </button>
              </div>
              <p className="field-label">Retskrivningsordbogen 5.1</p>
              <p className="dictionary-note">
                Only approved Danish forms, including every crossing word.
              </p>
              {unknown && (
                <p className="warning">
                  Correct board tiles marked ? before solving.
                </p>
              )}
              <button
                className="solve-button"
                disabled={
                  !position.rack.length ||
                  !!busy ||
                  unknown
                }
                onClick={() => findMoves()}
              >
                Find best moves <span aria-hidden="true">→</span>
              </button>
              {busy && (
                <div className="progress" role="status">
                  <span className="spinner" />
                  <span>{message}</span>
                  <button className="text-button" onClick={cancel}>
                    Cancel
                  </button>
                </div>
              )}
              {!busy && message && (
                <p className="status" role="status">
                  {message}
                </p>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </section>
            <section className="results">
              <div className="section-heading">
                <h2>
                  {solved ? "Your best moves" : "The next word is waiting"}
                </h2>
                {moves.length > 0 && (
                  <span className="result-count">{moves.length}</span>
                )}
              </div>
              <div className="result-tabs" role="tablist" aria-label="Move ranking">
                <button role="tab" aria-selected={resultsTab === "strategy"} onClick={() => setResultsTab("strategy")}>Strategy</button>
                <button role="tab" aria-selected={resultsTab === "points"} onClick={() => setResultsTab("points")}>Highest score</button>
              </div>
              {analysis && (
                <p className="strategy-status">
                  {analysis.warning ?? (resultsTab === "strategy"
                    ? `${analysisLabel} · ${analysis.rounds ? `${analysis.rounds} simulated scenarios per move` : "Rack and board estimates"}. Estimates assume unknown opponent letters.`
                    : "Exact points, ranked by immediate score.")}
                </p>
              )}
              {!solved ? (
                <div className="empty-results">
                  <div className="mini-tiles" aria-hidden="true">
                    <span>W</span>
                    <span>I</span>
                    <span>N</span>
                  </div>
                  <p>
                    Import your board or enter it by hand.
                    <br />
                    We’ll compare points, future turns, and possible opponent replies.
                  </p>
                </div>
              ) : !moves.length ? (
                <div className="empty-results">
                  <p>
                    No legal moves found with these letters and Retskrivningsordbogen.
                    Check the position. Every formed word must be in Retskrivningsordbogen.
                  </p>
                </div>
              ) : (
                <>
                  <p className="tiny result-summary">{summary}</p>
                  <div className="move-list">
                    {moves.map((m, i) => (
                      <button
                        key={`${m.word}-${m.row}-${m.col}-${m.direction}-${i}`}
                        aria-pressed={active === m}
                        className={`move ${active === m ? "active" : ""}`}
                        onClick={() => setSelected(moveKey(m))}
                      >
                        <span className="rank">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="move-details">
                          <strong>{m.word}</strong>
                          <small>
                            {String.fromCharCode(65 + m.col)}
                            {m.row + 1} ·{" "}
                            {m.direction === "across" ? "→ Across" : "↓ Down"} ·{" "}
                            {m.placed.length} tiles
                          </small>
                          {resultsTab === "strategy" && "strategy" in m && (
                            <small className="strategy-value">{(m as StrategicMove).strategy.value.toFixed(1)} estimated advantage</small>
                          )}
                        </span>
                        <span className="score">
                          {m.score}
                          <small>pts</small>
                        </span>
                      </button>
                    ))}
                  </div>
                  {active && (
                    <div className="breakdown">
                      {resultsTab === "strategy" && strategic && (
                        <>
                          <h3>Why this move</h3>
                          <p>Keep {strategic.strategy.leave || "no letters"} · {strategic.strategy.samples ? "Future turns simulated" : "Heuristic estimate"}</p>
                          {strategic.strategy.opponentMean !== null && (
                            <>
                              <div><span>Opponent’s estimated reply</span><strong>{strategic.strategy.opponentMean.toFixed(1)} pts</strong></div>
                              <div><span>Your estimated next turn</span><strong>{strategic.strategy.nextMean!.toFixed(1)} pts</strong></div>
                              <div><span>Large reply risk (90th percentile)</span><strong>{strategic.strategy.replyP90!.toFixed(1)} pts</strong></div>
                            </>
                          )}
                          <p>{recommendationReasons(strategic, highest && analysis?.strategyMoves.find(m => moveKey(m) === moveKey(highest)))}</p>
                        </>
                      )}
                      <h3>How it scores</h3>
                      {active.words.map((w, i) => (
                        <div key={i}>
                          <span>
                            {w.word}{" "}
                            <small>RO 5.1</small>
                          </span>
                          <strong>{w.points}</strong>
                        </div>
                      ))}
                      {active.bingo > 0 && (
                        <div>
                          <span>All seven tiles</span>
                          <strong>+{active.bingo}</strong>
                        </div>
                      )}
                      <p>
                        {active.placed
                          .filter((p) => p.blank)
                          .map(
                            (p) =>
                              `Blank → ${p.letter} at ${String.fromCharCode(65 + (p.index % 15))}${Math.floor(p.index / 15) + 1}`,
                          )
                          .join(" · ") ||
                          "Highlighted tiles show exactly where to play."}
                      </p>
                    </div>
                  )}
                </>
              )}
            </section>
          </aside>
        </div>
        <footer>
          <span>
            <span aria-hidden="true">◈</span> Screenshots stay on your device.
          </span>
          <button className="text-button" onClick={() => setModal("help")}>
            Save to your iPhone ↗
          </button>
        </footer>
      </main>
      <dialog
        ref={dialog}
        onCancel={() => {
          setModal(null);
          setEdit(null);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setModal(null);
            setEdit(null);
          }
        }}
      >
        <div className="dialog-content">
          <div className="section-heading">
            <h2>
              {edit
                ? edit.kind === "board"
                  ? `Square ${String.fromCharCode(65 + (edit.index % 15))}${Math.floor(edit.index / 15) + 1}`
                  : `Rack tile ${edit.index + 1}`
                : modal === "settings"
                  ? "Game settings"
                  : modal === "crop"
                    ? "Adjust screenshot crop"
                    : "WordWin on your iPhone"}
            </h2>
            <button
              className="icon-button"
              aria-label="Close dialog"
              onClick={() => {
                setModal(null);
                setEdit(null);
              }}
            >
              ×
            </button>
          </div>
          {edit && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commitTile();
              }}
            >
              <label className="field-label">
                Letter
                <input
                  autoFocus
                  value={editLetter}
                  maxLength={1}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => {
                    const l = e.target.value.toUpperCase();
                    setEditLetter(l);
                    setEditValue(position.rules.values[l] ?? 1);
                  }}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={editBlank}
                  onChange={(e) => setEditBlank(e.target.checked)}
                />{" "}
                Blank tile (0 points)
                {edit.kind === "board" ? " — choose its letter" : ""}
              </label>
              <label className="field-label">
                Tile points
                <input
                  type="number"
                  min={0}
                  max={50}
                  disabled={editBlank}
                  value={editBlank ? 0 : editValue}
                  onChange={(e) => setEditValue(Number(e.target.value))}
                />
              </label>
              {edit.kind === "board" && (
                <label className="field-label">
                  Bonus under this tile
                  <select
                    value={editBonus}
                    onChange={(e) => setEditBonus(e.target.value as Bonus)}
                  >
                    {["", "DL", "TL", "DW", "TW"].map((b) => (
                      <option key={b} value={b}>
                        {b || "None"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => commitTile(true)}
                >
                  Remove tile
                </button>
                <button className="solve-button" type="submit">
                  Save square
                </button>
              </div>
            </form>
          )}
          {modal === "settings" && (
            <>
              <p className="dialog-description">
                Match these settings to your game. Screenshot tile values are
                kept until you select a scoring preset.
              </p>
              <label className="field-label">
                Scoring preset
                <select
                  value={profile}
                  onChange={(e) => changeProfile(e.target.value as "da" | "en")}
                >
                  <option value="da">Danish Wordfeud</option>
                  <option value="en">English Wordfeud</option>
                </select>
              </label>
              <div className="two-fields">
                <label className="field-label">
                  Seven-tile bonus
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={position.rules.bingo}
                    onChange={(e) => {
                      setPosition((p) => ({
                        ...p,
                        rules: { ...p.rules, bingo: Number(e.target.value) },
                      }));
                      invalidate();
                    }}
                  />
                </label>
                <label className="field-label">
                  Center square
                  <select
                    value={position.bonuses[112]}
                    onChange={(e) => {
                      const b = e.target.value as Bonus;
                      setPosition((p) => {
                        const bonuses = p.bonuses.slice();
                        bonuses[112] = b;
                        return {
                          ...p,
                          bonuses,
                          rules: { ...p.rules, center: b },
                        };
                      });
                      invalidate();
                    }}
                  >
                    {["", "DL", "TL", "DW", "TW"].map((b) => (
                      <option value={b} key={b}>
                        {b || "No bonus"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <details>
                <summary>Letter values for new tiles</summary>
                <p className="tiny">
                  Edit existing board and rack values by tapping their tiles.
                </p>
                <div className="letter-values">
                  {[...ALPHABET].map((l) => (
                    <label key={l}>
                      {l}
                      <input
                        aria-label={`${l} tile value`}
                        type="number"
                        min={0}
                        max={50}
                        value={position.rules.values[l]}
                        onChange={(e) => {
                          setPosition((p) => ({
                            ...p,
                            rules: {
                              ...p.rules,
                              values: {
                                ...p.rules.values,
                                [l]: Number(e.target.value),
                              },
                            },
                          }));
                          invalidate();
                        }}
                      />
                    </label>
                  ))}
                </div>
              </details>
              <h3>Retskrivningsordbogen 5.1</h3>
              <p className="dialog-description">
                Main words and crossing words use the official COR1 1.5.1.0
                register from Dansk Sprognævn. Only forms marked normeret (N)
                are accepted. No additional inflections or compounds are generated.
              </p>
              <p className="license-links">
                <a href="https://ordregister.dk/" target="_blank" rel="noreferrer">Official source</a>
                <a href={`${import.meta.env.BASE_URL}dictionaries/ro-metadata.json`} target="_blank" rel="noreferrer">Dictionary version</a>
              </p>
            </>
          )}
          {modal === "crop" && canvas && crop && (
            <>
              <p className="dialog-description">
                The outlined square must cover the entire 15×15 board. Rack top
                should align with the top of your letter tiles.
              </p>
              <div className="crop-preview">
                <img
                  src={imageUrl}
                  alt="Imported screenshot with board crop outline"
                />
                <div
                  style={{
                    left: `${(crop.x / canvas.width) * 100}%`,
                    top: `${(crop.y / canvas.height) * 100}%`,
                    width: `${(crop.size / canvas.width) * 100}%`,
                    height: `${(crop.size / canvas.height) * 100}%`,
                  }}
                />
              </div>
              <div className="two-fields">
                {(
                  [
                    { key: "x", label: "Board left", base: canvas.width },
                    { key: "y", label: "Board top", base: canvas.height },
                    { key: "size", label: "Board width", base: canvas.width },
                    { key: "rackY", label: "Rack top", base: canvas.height },
                    { key: "rackX", label: "Rack left", base: canvas.width },
                    {
                      key: "rackWidth",
                      label: "Rack width",
                      base: canvas.width,
                    },
                  ] as const
                ).map((f) => (
                  <label key={f.key} className="field-label">
                    {f.label} (%)
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      max={100}
                      value={Number(((crop[f.key] / f.base) * 100).toFixed(1))}
                      onChange={(e) =>
                        setCrop({
                          ...crop,
                          [f.key]: (Number(e.target.value) / 100) * f.base,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                className="solve-button"
                onClick={() => {
                  if (
                    crop.size <= 0 ||
                    crop.x + crop.size > canvas.width + 2 ||
                    crop.y + crop.size > canvas.height ||
                    crop.rackWidth <= 0
                  ) {
                    setError("Crop must fit inside the screenshot.");
                    return;
                  }
                  setModal(null);
                  void scan(canvas, crop);
                }}
              >
                Read adjusted crop
              </button>
            </>
          )}
          {modal === "help" && (
            <>
              <p className="dialog-description">
                Open <strong>krois.dk/wordwin/</strong> in Safari, tap{" "}
                <strong>Share</strong>, then <strong>Add to Home Screen</strong>
                . WordWin will open like an app.
              </p>
              <h3>From screenshot to next move</h3>
              <ol className="help-steps">
                <li>
                  Import a full screenshot with the board and your rack visible.
                </li>
                <li>
                  Check the detected layout, every letter, point value, and
                  blank. Tap a square to correct it; use Adjust crop if needed.
                </li>
                <li>
                  Your best moves are calculated automatically after import.
                </li>
                <li>
                  Tap a result to see its exact placement and score. Play it
                  manually in your game.
                </li>
              </ol>
              <h3>Take it offline</h3>
              <p className="dialog-description">
                Download the dictionary and recognition files once. Your latest
                position is stored on this device.
              </p>
              <button
                className="solve-button"
                disabled={downloading}
                onClick={() => void downloadOffline()}
              >
                {downloading ? "Downloading…" : "Download for offline use"}
              </button>
              <p role="status" className="tiny">
                {offline}
              </p>
              <h3>What “best” means</h3>
              <p className="dialog-description">
                Highest score exhaustively ranks legal placements by exact points.
                Strategy compares up to 12 candidates using remaining letters,
                possible opponent replies, your next draw, and your following turn.
                It analyzes for up to 30 seconds after the exact search; you can
                stop early and keep completed results.
              </p>
              <p className="dialog-description">
                Strategy uses the Danish Wordfeud tile distribution and assumes
                unknown opponent letters are drawn randomly from unseen tiles.
                It favors expected point advantage with a moderate penalty for
                large replies. Estimates do not predict a guaranteed outcome or
                your chance of winning. Fewer than eight scenarios is limited
                analysis. Only word placements are recommended; screenshots and
                analysis stay on your device.
              </p>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
