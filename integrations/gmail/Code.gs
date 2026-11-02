/* Paste this entire file into a standalone Google Apps Script project. */

function configureWordWin() {
  // Change this to YOUR Gmail address, then run this function once in the editor.
  const recipient = "YOUR_ADDRESS@gmail.com";
  if (recipient === "YOUR_ADDRESS@gmail.com") throw new Error("Set your own Gmail address first.");
  PropertiesService.getScriptProperties().setProperty("WORDWIN_RECIPIENT", recipient);
  // Prompts Google to authorize sending mail. Does not read your inbox or send a test email.
  return MailApp.getRemainingDailyQuota();
}

function doPost(request) {
  try {
    if (!request || !request.postData || request.postData.contents.length > 16000) return reply_(false);
    const event = JSON.parse(request.postData.contents);
    if (!validBoardEvent_(event)) return reply_(false);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return reply_(false);
    try {
      const properties = PropertiesService.getScriptProperties();
      const recipient = properties.getProperty("WORDWIN_RECIPIENT");
      if (!recipient || /[\r\n,;]/.test(recipient)) return reply_(false);
      const today = new Date().toISOString().slice(0, 10);
      // Store IDs and counts only. Board data goes into the email, never script storage.
      let recent = JSON.parse(properties.getProperty("WORDWIN_RECENT") || "[]");
      recent = recent.filter(item => Date.now() - item.at < 7 * 86400000).slice(-99);
      if (recent.some(item => item.id === event.id)) return reply_(true);
      let counts = JSON.parse(properties.getProperty("WORDWIN_COUNTS") || "{}");
      if (counts.day !== today) counts = { day: today, total: 0, users: {} };
      // Fixed recipient and caps: this public endpoint cannot email arbitrary addresses.
      if (counts.total >= 100 || (counts.users[event.userId] || 0) >= 20 || MailApp.getRemainingDailyQuota() < 1)
        return reply_(false);
      const position = event.position;
      const rows = Array.from({ length: 15 }, (_, row) => position.board.slice(row * 15, row * 15 + 15)
        .map(t => !t ? "." : t.blank ? t.letter.toLowerCase() : t.letter).join(" "));
      const grid = rows.join("\n");
      const rack = position.rack.map(t => t.blank ? "?" : t.letter).join(" ");
      const text = "WordWin board imported\n\nUser: " + event.userId + "\nTime (UTC): " + event.at +
        "\nEvent: " + event.id + "\n\n" + grid + "\n\nRack: " + rack +
        "\nDots are empty squares; lowercase letters are blank tiles.\nThe JSON attachment contains tile values, bonuses and scoring rules.\nNo screenshot was sent.";
      MailApp.sendEmail({
        to: recipient,
        subject: "WordWin board · " + event.userId.slice(0, 8) + " · " + event.at.slice(0, 16).replace("T", " ") + " UTC",
        body: text,
        htmlBody: "<h2>WordWin board imported</h2><pre style=\"font-family:monospace;white-space:pre\">" + text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</pre>",
        attachments: [Utilities.newBlob(JSON.stringify(position, null, 2), "application/json", "board.json")],
        name: "WordWin",
      });
      recent.push({ id: event.id, at: Date.now() });
      counts.total++;
      counts.users[event.userId] = (counts.users[event.userId] || 0) + 1;
      // Two properties stay below Apps Script's per-property size limit.
      properties.setProperty("WORDWIN_RECENT", JSON.stringify(recent.slice(-100)));
      properties.setProperty("WORDWIN_COUNTS", JSON.stringify(counts));
      return reply_(true);
    } finally { lock.releaseLock(); }
  } catch (error) {
    // Do not log payloads, letters, addresses or credentials.
    console.error("WordWin email notification failed.");
    return reply_(false);
  }
}

function reply_(ok) {
  return ContentService.createTextOutput(JSON.stringify({ ok: ok })).setMimeType(ContentService.MimeType.JSON);
}
function object_(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
}
function number_(value) { return Number.isInteger(value) && value >= 0 && value <= 1000; }
function tile_(tile) {
  return object_(tile, ["letter", "value", "blank"]) && /^[A-ZÆØÅ?]$/.test(tile.letter) &&
    number_(tile.value) && typeof tile.blank === "boolean" && (!tile.blank || tile.value === 0);
}
function validBoardEvent_(event) {
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const bonuses = ["", "DL", "TL", "DW", "TW", "4L", "5L", "4W", "5W"];
  if (!object_(event, ["id", "userId", "sessionId", "at", "kind", "position"]) || event.kind !== "board_import" ||
    !id.test(event.id) || !id.test(event.userId) || !id.test(event.sessionId) || typeof event.at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(event.at) || !Number.isFinite(Date.parse(event.at)) || Date.parse(event.at) > Date.now() + 86400000) return false;
  const p = event.position;
  return !!(object_(p, ["board", "rack", "bonuses", "rules"]) &&
    Array.isArray(p.board) && p.board.length === 225 && p.board.every(t => t === null || tile_(t)) &&
    Array.isArray(p.rack) && p.rack.length <= 7 && p.rack.every(tile_) &&
    Array.isArray(p.bonuses) && p.bonuses.length === 225 && p.bonuses.every(b => bonuses.includes(b)) &&
    object_(p.rules, ["values", "bingo", "center"]) && number_(p.rules.bingo) && bonuses.includes(p.rules.center) &&
    object_(p.rules.values, [..."ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ"]) && Object.values(p.rules.values).every(number_));
}
