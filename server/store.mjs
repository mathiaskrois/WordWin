import { DatabaseSync } from "node:sqlite";
export function openStore(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL,
      at TEXT NOT NULL, received_at TEXT NOT NULL, kind TEXT NOT NULL, position TEXT
    );
    CREATE INDEX IF NOT EXISTS events_user_time ON events(user_id, at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS users_last_seen ON users(last_seen DESC, id DESC);`);
  const insertUser = db.prepare(`INSERT INTO users VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET first_seen = min(first_seen, excluded.first_seen), last_seen = max(last_seen, excluded.last_seen)`);
  const insertEvent = db.prepare("INSERT OR IGNORE INTO events VALUES (?, ?, ?, ?, ?, ?, ?)");
  return {
    close: () => db.close(),
    append(events) {
      db.exec("BEGIN");
      try {
        const receivedAt = new Date().toISOString();
        for (const event of events) {
          if (db.prepare("SELECT 1 FROM events WHERE id = ?").get(event.id)) continue;
          insertUser.run(event.userId, event.at, event.at);
          insertEvent.run(event.id, event.userId, event.sessionId, event.at, receivedAt, event.kind,
            event.position ? JSON.stringify(event.position) : null);
        }
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    users(offset = 0) {
      const rows = db.prepare(`SELECT u.id, u.first_seen AS firstSeen, u.last_seen AS lastSeen,
        (SELECT count(*) FROM events WHERE user_id = u.id AND kind IN ('open', 'resume')) AS visits,
        (SELECT count(*) FROM events WHERE user_id = u.id AND kind = 'board_import') AS imports,
        (SELECT count(*) FROM events WHERE user_id = u.id AND kind = 'solve') AS solves
        FROM users u ORDER BY last_seen DESC, id DESC LIMIT 101 OFFSET ?`).all(offset);
      return { users: rows.slice(0, 100), nextOffset: rows.length > 100 ? offset + 100 : null };
    },
    events(userId, offset = 0) {
      const rows = db.prepare(`SELECT id, user_id AS userId, session_id AS sessionId, at,
        received_at AS receivedAt, kind, position FROM events WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT 51 OFFSET ?`).all(userId, offset);
      return { events: rows.slice(0, 50).map(row => ({ ...row, position: row.position ? JSON.parse(row.position) : undefined })),
        nextOffset: rows.length > 50 ? offset + 50 : null };
    },
  };
}
