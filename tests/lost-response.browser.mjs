import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const state = mkdtempSync(join(tmpdir(), "friiigooo-browser-"));
const port = 8792;
const base = `http://127.0.0.1:${port}`;
const workerBin = join(root, "node_modules/.bin/wrangler");
let worker; let browser;
let step = "initialisation";
function run(...args) { return execFileSync(workerBin, args, { cwd: root, encoding: "utf8", input: "y\n", env: { ...process.env, CI: "true" } }); }
async function ready() { for (let i = 0; i < 50; i += 1) { try { if ((await fetch(`${base}/`, { signal: AbortSignal.timeout(300) })).ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error("Worker indisponible"); }
try {
  console.log("[lost-response] build");
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "ignore" });
  console.log("[lost-response] migrations"); run("d1", "migrations", "apply", "site-creator-d1", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json");
  console.log("[lost-response] worker");
  worker = spawn(workerBin, ["dev", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json", "--port", String(port), "--var", "SUPERVIE_ACCESS_CODE:supervie"], { cwd: root, stdio: "ignore" });
  await ready(); step = "worker prêt";
  browser = await chromium.launch(); const page = await browser.newPage();
  console.log("[lost-response] authentification"); await page.goto(base, { waitUntil: "networkidle", timeout: 10_000 }); await page.getByLabel("Code d’accès").fill("supervie"); await page.getByRole("button", { name: "Entrer" }).click();
  await page.getByRole("button", { name: /AJOUTER UN ARTICLE/i }).click();
  await page.locator("textarea").fill("perdu");
  let key = ""; let body = "";
  await page.route("**/api/lists", async route => {
    if (route.request().method() !== "POST") return route.continue();
    key = route.request().headers()["x-supervie-mutation-id"] ?? ""; body = route.request().postData() ?? "";
    await route.fetch(); await route.abort();
  });
  step = "mutation interceptée"; await page.getByRole("button", { name: /ajouter/i }).last().click();
  await page.waitForTimeout(300);
  assert.ok(key && body.includes("perdu")); step = "commit confirmé";
  const first = await (await fetch(`${base}/api/lists`, { headers: { "x-supervie-access-code": "supervie" } })).json();
  assert.equal(first.lists[0].items.filter(item => item.label === "perdu").length, 1);
  assert.ok(await page.evaluate(() => localStorage.getItem("supervie-pending-list-mutations")?.includes("perdu")));
  await page.unroute("**/api/lists"); step = "rechargement"; await page.reload({ waitUntil: "networkidle", timeout: 10_000 }); await page.waitForTimeout(600);
  const second = await (await fetch(`${base}/api/lists`, { headers: { "x-supervie-access-code": "supervie" } })).json();
  assert.equal(second.lists[0].items.filter(item => item.label === "perdu").length, 1);
  assert.equal(await page.evaluate(() => localStorage.getItem("supervie-pending-list-mutations")), "[]");
  console.log(`[lost-response] succès replay key=${key} body=${body}`);
} catch (error) { console.error(`[lost-response] échec à ${step}`, error); process.exitCode = 1; throw error; }
finally { console.log("[lost-response] nettoyage"); await browser?.close(); worker?.kill(); rmSync(state, { recursive: true, force: true }); }
