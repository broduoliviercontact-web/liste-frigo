import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const builtConfig = "dist/server/wrangler.json";
const state = mkdtempSync(join(tmpdir(), "friiigooo-reliability-"));
const port = 8803;
const base = `http://127.0.0.1:${port}`;
const headers = { "content-type": "application/json", "x-supervie-access-code": "supervie" };
let worker;

function wrangler(...args) {
  return execFileSync(join(root, "node_modules/.bin/wrangler"), args, { cwd: root, encoding: "utf8", input: "y\n", timeout: 30_000, env: { ...process.env, CI: "true" } });
}
async function waitReady() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${base}/api/lists`, { headers, signal: AbortSignal.timeout(250) })).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Worker local indisponible");
}
test.before(async () => {
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "ignore" });
  wrangler("d1", "migrations", "apply", "site-creator-d1", "--local", "--persist-to", state, "--config", builtConfig);
  worker = spawn(join(root, "node_modules/.bin/wrangler"), ["dev", "--local", "--persist-to", state, "--config", builtConfig, "--port", String(port), "--var", "SUPERVIE_ACCESS_CODE:supervie"], { cwd: root, stdio: "ignore" });
  await waitReady();
});
test.after(() => { worker?.kill(); rmSync(state, { recursive: true, force: true }); });



test('browser: modal keyboard and fresh settings after another client changed visibility',async()=>{
 const browser=await chromium.launch();try {
 const context=await browser.newContext();const page=await context.newPage();
 await page.goto(base);await page.getByLabel('Code d’accès').fill('supervie');await page.getByRole('button',{name:'Entrer',exact:true}).click();
 const open=page.getByRole('button',{name:/Ajouter un article/i});await open.click();
 await page.locator('textarea').waitFor();await page.keyboard.press('Shift+Tab');
 assert.equal(await page.getByRole('button',{name:'Ajouter la liste',exact:true}).evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Tab');assert.equal(await page.locator('textarea').evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await open.evaluate(el=>el===document.activeElement),true);
 const initial=await (await fetch(`${base}/api/epaper-settings`,{headers})).json();
 const tabs=initial.visibleTabs.filter(t=>t!=='air');
 assert.equal((await fetch(`${base}/api/epaper-settings`,{method:'POST',headers,body:JSON.stringify({revision:initial.revision,visibleTabs:tabs})})).status,200);
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/epaper-settings')&&r.request().method()==='POST');
 await page.getByRole('button',{name:/^métro$/i}).click();assert.equal((await saved).status(),200);
 const final=await(await fetch(`${base}/api/epaper-settings`,{headers})).json();assert.equal(final.activeTab,'metro');assert.deepEqual(final.visibleTabs,tabs);
 }finally{await browser.close();}
});
