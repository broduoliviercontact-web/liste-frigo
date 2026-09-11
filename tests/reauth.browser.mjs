import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname; const state = mkdtempSync(join(tmpdir(), "friiigooo-reauth-")); const port = 8793; const base = `http://127.0.0.1:${port}`; const bin = join(root, "node_modules/.bin/wrangler"); let worker; let browser;
function run(...args) { return execFileSync(bin, args, { cwd: root, encoding: "utf8", input: "y\n", env: { ...process.env, CI: "true" } }); }
async function ready() { for (let i = 0; i < 50; i += 1) { try { if ((await fetch(base, { signal: AbortSignal.timeout(300) })).ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error("Worker indisponible"); }
try {
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "ignore" }); run("d1", "migrations", "apply", "site-creator-d1", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json"); worker = spawn(bin, ["dev", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json", "--port", String(port), "--var", "SUPERVIE_ACCESS_CODE:supervie"], { cwd: root, stdio: "ignore" }); await ready();
  browser = await chromium.launch(); const page = await browser.newPage(); await page.goto(base); await page.getByLabel("Code d’accès").fill("supervie"); await page.getByRole("button", { name: "Entrer" }).click(); await page.getByRole("button", { name: /AJOUTER UN ARTICLE/i }).click(); await page.locator("textarea").fill("reauth");
  let firstKey = ""; let firstBody = ""; let replayKey = ""; let replayBody = ""; let denied = true;
  await page.route("**/api/lists", async route => { if (route.request().method() !== "POST") return route.continue(); if (denied) { denied = false; firstKey = route.request().headers()["x-supervie-mutation-id"] ?? ""; firstBody = route.request().postData() ?? ""; return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Accès SUPERVIE requis"}' }); } replayKey = route.request().headers()["x-supervie-mutation-id"] ?? ""; replayBody = route.request().postData() ?? ""; return route.continue(); });
  await page.getByRole("button", { name: /ajouter/i }).last().click(); await page.getByLabel("Code d’accès").waitFor({ timeout: 5_000 });
  const before = await (await fetch(`${base}/api/lists`, { headers: { "x-supervie-access-code": "supervie" } })).json(); assert.equal(before.lists[0].items.filter(item => item.label === "reauth").length, 0); assert.ok(await page.evaluate(() => localStorage.getItem("supervie-pending-list-mutations")?.includes("reauth")));
  await page.getByLabel("Code d’accès").fill("supervie"); await page.getByRole("button", { name: "Entrer" }).click(); await page.waitForFunction(() => !localStorage.getItem("supervie-pending-list-mutations") || localStorage.getItem("supervie-pending-list-mutations") === "[]", null, { timeout: 5_000 });
  const after = await (await fetch(`${base}/api/lists`, { headers: { "x-supervie-access-code": "supervie" } })).json(); assert.equal(after.lists[0].items.filter(item => item.label === "reauth").length, 1); assert.equal(firstKey, replayKey); assert.equal(firstBody, replayBody); console.log(`[reauth] replay ${replayKey}`);
} finally { await browser?.close(); worker?.kill(); rmSync(state, { recursive: true, force: true }); }
