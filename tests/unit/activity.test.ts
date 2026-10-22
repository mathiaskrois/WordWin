import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { initialPosition, tile } from "../../src/model";
let stored: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  stored = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("only a board representation is transmitted and acknowledged events leave the offline queue", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  const { recordActivity, ACTIVITY_STORE } = await import("../../src/activity");
  const position = { ...initialPosition(), screenshot: "data:image/png;base64,secret", filename: "private.png" };
  position.board[112] = tile("Ø", undefined, true);
  recordActivity("board_import", position);
  await vi.waitFor(() => expect(JSON.parse(stored.get(ACTIVITY_STORE)!).pending).toHaveLength(0));
  const sent = JSON.parse(fetch.mock.calls[0][1].body);
  expect(sent.events[0].position.board[112]).toEqual({ letter: "Ø", blank: true, value: 0 });
  expect(fetch.mock.calls[0][1].body).not.toContain("secret");
  expect(fetch.mock.calls[0][1].body).not.toContain("private.png");
});

test("offline events retain their identity and timestamp when retried", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  const { recordActivity, flushActivity, ACTIVITY_STORE } = await import("../../src/activity");
  recordActivity("open");
  const queued = JSON.parse(stored.get(ACTIVITY_STORE)!).pending;
  expect(fetch).not.toHaveBeenCalled();
  vi.stubGlobal("navigator", { onLine: true });
  await flushActivity();
  expect(JSON.parse(fetch.mock.calls[0][1].body).events).toEqual(queued);
  expect(JSON.parse(stored.get(ACTIVITY_STORE)!).pending).toEqual([]);
});


test("Gmail mode dispatches only imported boards and uses no Gmail credentials", async () => {
  vi.stubEnv("VITE_BOARD_EMAIL_URL", "https://script.google.com/macros/s/test-deployment/exec");
  const fetch = vi.fn().mockResolvedValue({ ok: false, type: "opaque" });
  vi.stubGlobal("fetch", fetch);
  const { recordActivity, ACTIVITY_STORE } = await import("../../src/activity");
  recordActivity("open"); recordActivity("solve", initialPosition()); recordActivity("board_rescan", initialPosition());
  expect(fetch).not.toHaveBeenCalled();
  recordActivity("board_import", initialPosition());
  await vi.waitFor(() => expect(JSON.parse(stored.get(ACTIVITY_STORE)!).pending).toHaveLength(0));
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe("https://script.google.com/macros/s/test-deployment/exec");
  expect(request.mode).toBe("no-cors"); expect(request.credentials).toBe("omit");
  expect(request.headers.Authorization).toBeUndefined();
  expect(JSON.parse(request.body).kind).toBe("board_import");
});

test("Gmail mode keeps notifications queued after a network failure and retries offline imports", async () => {
  vi.stubEnv("VITE_BOARD_EMAIL_URL", "https://script.google.com/macros/s/test-deployment/exec");
  vi.stubGlobal("navigator", { onLine: false });
  const fetch = vi.fn().mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValue({ type: "opaque" });
  vi.stubGlobal("fetch", fetch);
  const { recordActivity, flushActivity, ACTIVITY_STORE } = await import("../../src/activity");
  recordActivity("board_import", initialPosition());
  const queued = JSON.parse(stored.get(ACTIVITY_STORE)!).pending;
  vi.stubGlobal("navigator", { onLine: true });
  await flushActivity();
  expect(JSON.parse(stored.get(ACTIVITY_STORE)!).pending).toHaveLength(1);
  await flushActivity();
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(queued[0]);
  expect(JSON.parse(stored.get(ACTIVITY_STORE)!).pending).toEqual([]);
});


test("opening the email build flushes an import queued on a previous offline visit", async () => {
  vi.stubEnv("VITE_BOARD_EMAIL_URL", "https://script.google.com/macros/s/test-deployment/exec");
  vi.stubGlobal("navigator", { onLine: false });
  vi.stubGlobal("window", { addEventListener: vi.fn() });
  vi.stubGlobal("document", { addEventListener: vi.fn() });
  const fetch = vi.fn().mockResolvedValue({ type: "opaque" });
  vi.stubGlobal("fetch", fetch);
  const { recordActivity, startActivity, ACTIVITY_STORE } = await import("../../src/activity");
  recordActivity("board_import", initialPosition());
  vi.stubGlobal("navigator", { onLine: true });
  startActivity();
  await vi.waitFor(() => expect(JSON.parse(stored.get(ACTIVITY_STORE)!).pending).toHaveLength(0));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body).kind).toBe("board_import");
});
