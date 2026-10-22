import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { openStore } from "./store.mjs";
import { validEvent, validId } from "./validation.mjs";

function validateConfig({ adminToken, allowedOrigin, basePath }) {
  if (!adminToken || adminToken.length < 24) throw new Error("ADMIN_TOKEN must contain at least 24 characters.");
  if (!allowedOrigin || new URL(allowedOrigin).origin !== allowedOrigin) throw new Error("APP_ORIGIN must be an exact origin, e.g. https://krois.dk");
  if (!/^\/[a-zA-Z0-9/_-]+[^/]$/.test(basePath)) throw new Error("API_BASE_PATH must be an absolute path without a trailing slash.");
}
export function createActivityServer({ store, adminToken, allowedOrigin, basePath = "/wordwin/api" }) {
  validateConfig({ adminToken, allowedOrigin, basePath });
  const buckets = new Map();
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Origin");
    const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    try {
      if (req.headers.origin && req.headers.origin !== allowedOrigin) return send(403, { error: "Origin not allowed" });
      if (req.headers.origin === allowedOrigin) {
        res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      }
      if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
      const url = new URL(req.url, "http://localhost");
      if (req.method === "POST" && url.pathname === `${basePath}/events`) {
        // Address is used only in this short-lived rate limiter, never in the database.
        const now = Date.now();
        for (const [key, bucket] of buckets) if (now > bucket.until) buckets.delete(key);
        const address = req.socket.remoteAddress || "unknown";
        const bucket = buckets.get(address) || { count: 0, until: now + 600000 };
        buckets.set(address, bucket);
        if (++bucket.count > 600) return send(429, { error: "Try again later" });
        if (!req.headers["content-type"]?.startsWith("application/json")) return send(415, { error: "JSON required" });
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 65536) { send(413, { error: "Request too large" }); return; }
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(400, { error: "Invalid JSON" }); }
        if (!body || Object.keys(body).some(key => key !== "events") || !Array.isArray(body.events) ||
          !body.events.length || body.events.length > 5 || !body.events.every(validEvent)) return send(400, { error: "Invalid events" });
        store.append(body.events);
        return send(200, { ok: true });
      }
      if (req.method !== "GET" || !url.pathname.startsWith(`${basePath}/users`)) return send(404, { error: "Not found" });
      const expected = Buffer.from(`Bearer ${adminToken}`);
      const supplied = Buffer.from(req.headers.authorization || "");
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return send(401, { error: "Unauthorized" });
      const rawOffset = url.searchParams.get("offset") || "0";
      if (!/^\d{1,9}$/.test(rawOffset)) return send(400, { error: "Invalid offset" });
      const offset = Number(rawOffset);
      if (url.pathname === `${basePath}/users`) return send(200, store.users(offset));
      const match = url.pathname.slice(basePath.length).match(/^\/users\/([^/]+)\/events$/);
      if (!match || !validId(match[1])) return send(404, { error: "Not found" });
      return send(200, store.events(match[1], offset));
    } catch { if (!res.headersSent) send(500, { error: "Activity service unavailable" }); else res.end(); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const adminToken = process.env.ADMIN_TOKEN;
  const allowedOrigin = process.env.APP_ORIGIN;
  // Validate configuration before creating the database file.
  const config = { adminToken, allowedOrigin, basePath: process.env.API_BASE_PATH || "/wordwin/api" };
  validateConfig(config);
  const store = openStore(process.env.ACTIVITY_DB || "activity.sqlite");
  const app = createActivityServer({ ...config, store });
  app.listen(Number(process.env.PORT || 8787), process.env.HOST || "127.0.0.1", () => console.log("WordWin activity service listening"));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { app.close(() => { store.close(); process.exit(0); }); });
}
