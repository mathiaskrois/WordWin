const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bonuses = new Set(["", "DL", "TL", "DW", "TW"]);
const kinds = new Set(["open", "resume", "board_import", "board_rescan", "import_failed", "solve"]);
function keys(value, allowed) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
}
const number = value => Number.isInteger(value) && value >= 0 && value <= 1000;
function tile(value) {
  return keys(value, ["letter", "value", "blank"]) && /^[A-ZÆØÅ?]$/.test(value.letter) &&
    number(value.value) && typeof value.blank === "boolean" && (!value.blank || value.value === 0);
}
export function validPosition(value) {
  return keys(value, ["board", "rack", "bonuses", "rules"]) &&
    Array.isArray(value.board) && value.board.length === 225 && value.board.every(t => t === null || tile(t)) &&
    Array.isArray(value.rack) && value.rack.length <= 7 && value.rack.every(tile) &&
    Array.isArray(value.bonuses) && value.bonuses.length === 225 && value.bonuses.every(b => bonuses.has(b)) &&
    keys(value.rules, ["values", "bingo", "center"]) && number(value.rules.bingo) && bonuses.has(value.rules.center) &&
    keys(value.rules.values, [..."ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ"]) && Object.values(value.rules.values).every(number);
}
export function validEvent(event) {
  if (!keys(event, ["id", "userId", "sessionId", "at", "kind", "position"]) ||
    !uuid.test(event.id) || !uuid.test(event.userId) || !uuid.test(event.sessionId) || !kinds.has(event.kind) ||
    typeof event.at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(event.at) ||
    !Number.isFinite(Date.parse(event.at)) || Date.parse(event.at) > Date.now() + 86400000) return false;
  const needsBoard = ["board_import", "board_rescan", "solve"].includes(event.kind);
  return needsBoard ? validPosition(event.position) : event.position === undefined;
}
export const validId = value => uuid.test(value);
