import { useEffect, useState } from "react";
import { ACTIVITY_API, EMAIL_NOTIFICATIONS, type ActivityEvent } from "./activity";
interface User { id: string; firstSeen: string; lastSeen: string; visits: number; imports: number; solves: number }
interface StoredEvent extends ActivityEvent { receivedAt: string }
const labels: Record<ActivityEvent["kind"], string> = {
  open: "Opened app", resume: "Resumed app", board_import: "Imported board",
  board_rescan: "Adjusted board crop", import_failed: "Import failed", solve: "Calculated moves",
};
const date = (value: string) => new Date(value).toLocaleString();
export default function Users() {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [nextUsers, setNextUsers] = useState<number | null>(null);
  const [nextEvents, setNextEvents] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = "Users · WordWin";
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex, nofollow";
    document.head.append(meta);
    return () => meta.remove();
  }, []);
  async function request(path: string, key = token) {
    const response = await fetch(`${ACTIVITY_API}${path}`, {
      headers: { Authorization: `Bearer ${key}` }, cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401) throw new Error("Incorrect admin password.");
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      throw new Error("User log unavailable. Check the activity backend configuration.");
    return response.json();
  }
  async function loadUsers(key = token, offset = 0) {
    setBusy(true); setError("");
    try {
      const data = await request(`/users?offset=${offset}`, key);
      setUsers(old => offset ? [...old, ...data.users] : data.users);
      setNextUsers(data.nextOffset); setToken(key); setPassword("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load users."); }
    finally { setBusy(false); }
  }
  async function loadEvents(user: User, offset = 0) {
    setBusy(true); setError("");
    if (!offset) { setSelected(user); setEvents([]); setNextEvents(null); }
    try {
      const data = await request(`/users/${user.id}/events?offset=${offset}`);
      setEvents(old => offset ? [...old, ...data.events] : data.events);
      setNextEvents(data.nextOffset);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load activity."); }
    finally { setBusy(false); }
  }
  return <div className="users-page">
    <header><a className="brand" href={import.meta.env.BASE_URL}>WordWin</a><span>Private administration</span></header>
    <main>
      <h1>Users</h1>
      <p>Anonymous browser identities across devices. Each browser has its own ID; clearing browser data creates a new user.</p>
      {EMAIL_NOTIFICATIONS ? <p>Board notifications are delivered to the app owner’s Gmail. This build does not collect a shared user database.</p> : !token ? <form className="users-login" onSubmit={e => { e.preventDefault(); void loadUsers(password); }}>
        <label>Admin password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="solve-button" disabled={busy}> {busy ? "Connecting…" : "Unlock users"}</button>
      </form> : <>
        <div className="users-actions"><button disabled={busy} onClick={() => { setSelected(null); setEvents([]); void loadUsers(); }}>Refresh users</button>
          <button disabled={busy} onClick={() => { setToken(""); setPassword(""); setUsers([]); setEvents([]); setSelected(null); setError(""); }}>Lock</button></div>
        <p>{users.length} users loaded. Times are shown in your local timezone. Screenshots are never stored.</p>
        <div className="users-table"><table><thead><tr><th>User</th><th>First seen</th><th>Last used</th><th>Visits</th><th>Imports</th><th>Solves</th></tr></thead>
          <tbody>{users.map(user => <tr key={user.id}><td><button disabled={busy} title={user.id} onClick={() => void loadEvents(user)}>{user.id.slice(0, 8)}</button></td><td>{date(user.firstSeen)}</td><td>{date(user.lastSeen)}</td><td>{user.visits}</td><td>{user.imports}</td><td>{user.solves}</td></tr>)}</tbody></table></div>
        {!users.length && <p>No activity recorded yet.</p>}
        {nextUsers !== null && <button disabled={busy} onClick={() => void loadUsers(token, nextUsers)}>Load more users</button>}
        {selected && <section><h2>Activity for {selected.id.slice(0, 8)}</h2><p className="user-id">{selected.id}</p>
          {events.map(event => <article className="user-event" key={event.id}>
            <h3>{labels[event.kind]}</h3><p><time dateTime={event.at}>{date(event.at)}</time></p>
            {event.position && <>
              <div className="logged-board" role="img" aria-label="Recorded 15 by 15 board; lowercase letters represent blank tiles">
                {event.position.board.map((tile, i) => <span key={i} className={tile ? "occupied" : ""} title={`Row ${Math.floor(i / 15) + 1}, column ${i % 15 + 1}: ${tile ? `${tile.letter}, ${tile.value} points${tile.blank ? ", blank" : ""}` : event.position!.bonuses[i] || "empty"}`}>{tile ? tile.blank ? tile.letter.toLowerCase() : tile.letter : event.position!.bonuses[i] || "·"}</span>)}
              </div>
              <p>Rack: {event.position.rack.map(t => t.blank ? "?" : t.letter).join(" ") || "Empty"}. Lowercase board letters are blanks.</p>
            </>}
          </article>)}
          {!busy && !events.length && <p>No recorded activity.</p>}
          {nextEvents !== null && <button disabled={busy} onClick={() => void loadEvents(selected, nextEvents)}>Load more activity</button>}
        </section>}
      </>}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Loading…</p>}
    </main>
  </div>;
}
