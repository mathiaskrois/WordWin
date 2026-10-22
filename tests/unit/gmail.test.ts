import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import { expect, test, vi } from "vitest";
import { initialPosition, tile } from "../../src/model";

function script() {
  const properties = new Map<string, string>([["WORDWIN_RECIPIENT", "owner@gmail.com"]]);
  const sendEmail = vi.fn();
  const releaseLock = vi.fn();
  const context: any = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => properties.get(key) ?? null, setProperty: (key: string, value: string) => properties.set(key, value) }) },
    MailApp: { sendEmail, getRemainingDailyQuota: () => 100 },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (text: string) => ({ setMimeType: () => JSON.parse(text) }) },
    Utilities: { newBlob: (body: string, type: string, name: string) => ({ body, type, name }) },
    console: { error: vi.fn() },
  };
  runInNewContext(readFileSync("integrations/gmail/Code.gs", "utf8"), context);
  return { context, properties, sendEmail, releaseLock, post: (body: unknown) => context.doPost({ postData: { contents: JSON.stringify(body) } }) };
}
function event() {
  const position = initialPosition(); position.board[112] = tile("Ø", undefined, true);
  return { id: randomUUID(), userId: randomUUID(), sessionId: randomUUID(), at: new Date().toISOString(), kind: "board_import", position };
}
test("Apps Script sends a grid and JSON to the fixed Gmail recipient, deduplicating a retry", () => {
  const mail = script(); const board = event();
  expect(mail.post(board).ok).toBe(true); expect(mail.post(board).ok).toBe(true);
  expect(mail.sendEmail).toHaveBeenCalledTimes(1);
  const message = mail.sendEmail.mock.calls[0][0];
  expect(message.to).toBe("owner@gmail.com");
  expect(message.body).toContain("ø"); expect(message.body).toContain(board.userId);
  expect(message.attachments[0].type).toBe("application/json");
  expect(JSON.parse(message.attachments[0].body)).toEqual(board.position);
  expect([...mail.properties.values()].join(" ")).not.toContain('"board"');
  expect(mail.releaseLock).toHaveBeenCalledTimes(2);
});
test("Apps Script rejects image fields, arbitrary recipients, and non-import events", () => {
  const mail = script(); const board = event();
  expect(mail.post({ ...board, screenshot: "data:image/png;base64,secret" }).ok).toBe(false);
  expect(mail.post({ ...board, to: "someone-else@example.com" }).ok).toBe(false);
  expect(mail.post({ ...board, kind: "solve" }).ok).toBe(false);
  expect(mail.post({ ...board, position: { ...board.position, image: "secret" } }).ok).toBe(false);
  expect(mail.sendEmail).not.toHaveBeenCalled();
});
test("Apps Script respects exhausted daily quota", () => {
  const mail = script(); mail.context.MailApp.getRemainingDailyQuota = () => 0;
  expect(mail.post(event()).ok).toBe(false); expect(mail.sendEmail).not.toHaveBeenCalled();
  expect(mail.releaseLock).toHaveBeenCalledTimes(1);
});
