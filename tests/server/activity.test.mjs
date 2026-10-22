import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../../server/store.mjs";
import { createActivityServer } from "../../server/index.mjs";
import { validEvent } from "../../server/validation.mjs";
const token = "a-test-admin-password-with-32-chars";
const origin = "https://krois.dk";
const event = (kind = "open", userId = randomUUID()) => ({
  id: randomUUID(), userId, sessionId: randomUUID(), at: new Date().toISOString(), kind,
});
const position = () => ({ board: Array(225).fill(null), rack: [{ letter: "Æ", blank: false, value: 4 }],
  bonuses: Array(225).fill(""), rules: { values: { Æ: 4 }, bingo: 40, center: "" } });

test("strict event schema accepts board data and rejects images and excess data", () => {
  const imported = { ...event("board_import"), position: position() };
  imported.position.board[112] = { letter: "Ø", blank: true, value: 0 };
  assert.equal(validEvent(imported), true);
  assert.equal(validEvent({ ...imported, image: "data:image/png;base64,secret" }), false);
  assert.equal(validEvent({ ...imported, position: { ...position(), screenshot: "secret" } }), false);
  assert.equal(validEvent({ ...imported, position: { ...position(), board: [] } }), false);
  assert.equal(validEvent(event("board_import")), false);
  assert.equal(validEvent({ ...event(), position: position() }), false);
});

test("durable store deduplicates retries, orders offline activity, and keeps distinct users", () => {
  const store = openStore(":memory:");
  try {
    const first = event(); first.at = "2026-01-01T00:00:00.000Z";
    const imported = { ...event("board_import", first.userId), position: position() };
    const other = event();
    store.append([imported, first, other]); store.append([imported, first]);
    const users = store.users().users;
    assert.equal(users.length, 2);
    const user = users.find(u => u.id === first.userId);
    assert.equal(user.firstSeen, first.at);
    assert.equal(user.lastSeen, imported.at);
    assert.equal(user.visits, 1); assert.equal(user.imports, 1);
    const events = store.events(first.userId).events;
    assert.equal(events.length, 2); assert.deepEqual(events[0].position, imported.position);
    assert.equal(store.events(other.userId).events.length, 1);
  } finally { store.close(); }
});

test("server protects reads, rejects image payloads, allows ingest, and never caches private responses", async () => {
  const store = openStore(":memory:");
  const server = createActivityServer({ store, adminToken: token, allowedOrigin: origin });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/wordwin/api`;
  try {
    let response = await fetch(`${base}/users`);
    assert.equal(response.status, 401); assert.equal(response.headers.get("cache-control"), "no-store");
    response = await fetch(`${base}/users`, { headers: { Authorization: `Bearer ${token}`, Origin: "https://elsewhere.example" } });
    assert.equal(response.status, 403);
    const imported = { ...event("board_import"), position: position() };
    const post = events => fetch(`${base}/events`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ events }) });
    assert.equal((await post([{ ...imported, screenshot: "secret" }])).status, 400);
    assert.equal((await post([imported])).status, 200);
    assert.equal((await post([imported])).status, 200);
    response = await fetch(`${base}/users`, { headers: { Authorization: `Bearer ${token}`, Origin: origin } });
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    const data = await response.json(); assert.equal(data.users.length, 1); assert.equal(data.users[0].imports, 1);
    response = await fetch(`${base}/users/${imported.userId}/events`, { headers: { Authorization: `Bearer ${token}` } });
    assert.deepEqual((await response.json()).events[0].position, imported.position);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});


test("activity survives a service restart and paginates complete history", () => {
  const directory = mkdtempSync(join(tmpdir(), "wordwin-activity-"));
  const filename = join(directory, "test.sqlite");
  let store;
  try {
    store = openStore(filename);
    const userId = randomUUID();
    const events = Array.from({ length: 53 }, () => event("open", userId));
    store.append(events);
    store.close();
    store = openStore(filename);
    const first = store.events(userId);
    assert.equal(first.events.length, 50);
    assert.equal(first.nextOffset, 50);
    const next = store.events(userId, first.nextOffset);
    assert.equal(next.events.length, 3);
    assert.equal(next.nextOffset, null);
    assert.equal(new Set([...first.events, ...next.events].map(e => e.id)).size, 53);
    assert.equal(store.users().users[0].visits, 53);
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});
