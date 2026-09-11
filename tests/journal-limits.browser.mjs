import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const state = mkdtempSync(join(tmpdir(), "friiigooo-journal-limits-"));
const port = 8798;
const base = `http://127.0.0.1:${port}`;
const bin = join(root, "node_modules/.bin/wrangler");
const key = "supervie-pending-list-mutations";
const headers = { "x-supervie-access-code": "supervie" };
let worker;
let browser;

function run(...args) { return execFileSync(bin, args, { cwd: root, encoding: "utf8", input: "y\n", env: { ...process.env, CI: "true" } }); }
async function ready() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${base}/api/lists`, { headers, signal: AbortSignal.timeout(300) })).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Worker indisponible");
}
async function login(page) {
  await page.goto(base, { waitUntil: "networkidle", timeout: 10_000 });
  if (await page.getByLabel("Code d’accès").count()) {
    await page.getByLabel("Code d’accès").fill("supervie");
    await page.getByRole("button", { name: "Entrer" }).click();
  }
}
async function add(page, label) {
  await page.getByRole("button", { name: /AJOUTER UN ARTICLE/i }).click();
  await page.locator("textarea").fill(label);
  await page.getByRole("button", { name: /^Ajouter la liste$/i }).click();
}
async function itemCount(listId, label) {
  const data = await (await fetch(`${base}/api/lists`, { headers })).json();
  return data.lists.find((list) => list.id === listId).items.filter((item) => item.label === label).length;
}

try {
  console.log("[journal-limits] build");
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "ignore" });
  run("d1", "migrations", "apply", "site-creator-d1", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json");
  worker = spawn(bin, ["dev", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json", "--port", String(port), "--var", "SUPERVIE_ACCESS_CODE:supervie"], { cwd: root, stdio: "ignore" });
  await ready();
  const listId = (await (await fetch(`${base}/api/lists`, { headers })).json()).lists[0].id;
  browser = await chromium.launch();

  {
    const context = await browser.newContext();
    await context.addInitScript(() => Object.defineProperty(navigator, "locks", { value: undefined, configurable: true }));
    const a = await context.newPage(); const b = await context.newPage(); const posts = [];
    for (const page of [a, b]) {
      page.on("request", (request) => { if (request.url().includes("/api/lists") && request.method() === "POST") posts.push(request); });
      await login(page);
    }
    await Promise.all([add(a, "sans-lock-a"), add(b, "sans-lock-b")]);
    for (const page of [a, b]) {
      await page.getByRole("dialog", { name: "Ajouter un article" }).getByRole("alert").filter({ hasText: /Reprise multi-onglets indisponible : action non envoyée/ }).waitFor({ timeout: 3_000 });
    }
    assert.equal(await a.locator("textarea").inputValue(), "sans-lock-a"); assert.equal(await b.locator("textarea").inputValue(), "sans-lock-b");
    assert.equal(posts.length, 0); assert.equal(await itemCount(listId, "sans-lock-a"), 0); assert.equal(await itemCount(listId, "sans-lock-b"), 0);
    assert.equal(await a.evaluate((storageKey) => localStorage.getItem(storageKey), key), null);
    console.log("[journal-limits] sans Web Locks : mutations bloquées, aucune perte de journal"); await context.close();
  }

  for (const mode of ["read", "write"]) {
    const context = await browser.newContext();
    await context.addInitScript(({ storageKey, failureMode }) => {
      const getItem = Storage.prototype.getItem; const setItem = Storage.prototype.setItem;
      if (failureMode === "read") Storage.prototype.getItem = function (name) { if (name === storageKey) throw new DOMException("lecture indisponible", "QuotaExceededError"); return getItem.call(this, name); };
      if (failureMode === "write") Storage.prototype.setItem = function (name, value) { if (name === storageKey) throw new DOMException("quota dépassé", "QuotaExceededError"); return setItem.call(this, name, value); };
    }, { storageKey: key, failureMode: mode });
    const page = await context.newPage(); const label = `stockage-${mode}`; let posts = 0;
    page.on("request", (request) => { if (request.url().includes("/api/lists") && request.method() === "POST") posts += 1; });
    await login(page); await add(page, label);
    await page.getByRole("dialog", { name: "Ajouter un article" }).getByRole("alert").filter({ hasText: /Enregistrement local indisponible : action non envoyée/ }).waitFor({ timeout: 3_000 });
    assert.equal(await page.locator("textarea").inputValue(), label); assert.equal(posts, 0); assert.equal(await itemCount(listId, label), 0);
    console.log(`[journal-limits] stockage ${mode} : saisie conservée, aucune mutation envoyée`); await context.close();
  }

  {
    const expired = { id: "expired-uncertain-0001", action: { action: "addItems", listId, labels: ["expire-inconnu"] }, createdAt: Date.now() - (24 * 60 * 60 * 1000) - 1_000, status: "uncertain" };
    const context = await browser.newContext(); const posts = [];
    await context.addInitScript(({ storageKey, entry }) => localStorage.setItem(storageKey, JSON.stringify([entry])), { storageKey: key, entry: expired });
    const page = await context.newPage(); page.on("request", (request) => { if (request.url().includes("/api/lists") && request.method() === "POST") posts.push(request); });
    await login(page);
    await page.getByRole("paragraph").filter({ hasText: /Action expirée : résultat inconnu/ }).waitFor({ timeout: 3_000 });
    assert.equal(posts.length, 0); assert.equal(await itemCount(listId, "expire-inconnu"), 0);
    assert.ok((await page.evaluate((storageKey) => localStorage.getItem(storageKey), key))?.includes(expired.id));
    await page.reload({ waitUntil: "networkidle", timeout: 10_000 });
    await page.getByRole("paragraph").filter({ hasText: /Action expirée : résultat inconnu/ }).waitFor({ timeout: 3_000 });
    assert.equal(posts.length, 0); assert.ok((await page.evaluate((storageKey) => localStorage.getItem(storageKey), key))?.includes(expired.id));
    console.log("[journal-limits] expiration : aucun rejeu, décision utilisateur demandée"); await context.close();
  }
} finally {
  await browser?.close(); worker?.kill(); rmSync(state, { recursive: true, force: true });
}
