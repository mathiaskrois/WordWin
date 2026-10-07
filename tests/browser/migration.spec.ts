import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { initialPosition, rackFromText } from "../../src/model";

test("uppercase home-screen install upgrades to lowercase URL and preserves position", async ({page}) => {
  let upgraded = false;
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url!, "http://localhost").pathname;
      if (path === "/WordWin/" && !upgraded) {
        res.setHeader("Content-Type", "text/html");
        res.end("<!doctype html><title>Legacy WordWin</title><p>Old app</p>"); return;
      }
      if (path === "/WordWin/sw.js" && !upgraded) {
        res.setHeader("Content-Type", "text/javascript");
        res.end(`self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(Promise.resolve(new Response('<p>Cached old app</p>',{headers:{'Content-Type':'text/html'}})));});`); return;
      }
      const root = resolve(path.startsWith("/WordWin/") ? "hosting/WordWin" : "dist");
      const file = resolve(root, path.replace(/^\/(WordWin|wordwin)\//, "") || "index.html");
      if (!file.startsWith(root + sep)) {res.writeHead(403).end();return;}
      const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : file.endsWith(".json") ? "application/json" : "application/octet-stream";
      res.setHeader("Content-Type",type); res.end(await readFile(file));
    } catch {res.writeHead(404).end();}
  });
  await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
  const origin = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try {
    await page.goto(origin + "/WordWin/");
    await page.evaluate(async () => {await navigator.serviceWorker.register("/WordWin/sw.js",{scope:"/WordWin/"});await navigator.serviceWorker.ready;});
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const position = initialPosition(); position.rack = rackFromText("HEST",position.rules.values);
    await page.evaluate(position => localStorage.setItem("wordwin-v1",JSON.stringify({position,language:"en",layout:"classic",profile:"da"})),position);
    upgraded = true;
    await page.evaluate(async () => {await (await navigator.serviceWorker.getRegistration("/WordWin/"))!.update();});
    await expect(page).toHaveURL(origin + "/wordwin/");
    await expect(page.getByLabel("Rack letters",{exact:true})).toHaveValue("HEST");
    await expect(page.getByText("Retskrivningsordbogen 5.1",{exact:true})).toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => new URL(r.scope).pathname))).not.toContain("/WordWin/");
    // Fresh visits to the old bookmark also redirect.
    await page.goto(origin + "/WordWin/");
    await expect(page).toHaveURL(origin + "/wordwin/");
    await expect(page.getByLabel("Rack letters",{exact:true})).toHaveValue("HEST");
  } finally {server.close();server.closeAllConnections();}
});
