import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const state = mkdtempSync(join(tmpdir(), "friiigooo-multi-tab-"));
const port = 8797;
const base = `http://127.0.0.1:${port}`;
const bin = join(root, "node_modules/.bin/wrangler");
const headers = { "x-supervie-access-code": "supervie" };
let worker;
let browser;

function run(...args) { return execFileSync(bin, args, { cwd: root, encoding: "utf8", input: "y\n", env: { ...process.env, CI: "true" } }); }
function deferred() { let resolve; const promise = new Promise((next) => { resolve = next; }); return { promise, resolve }; }
async function ready() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${base}/api/lists`, { headers, signal: AbortSignal.timeout(300) })).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Worker indisponible");
}
async function waitFor(check, timeout, message) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(message);
}
async function journal(page) { return page.evaluate(() => JSON.parse(localStorage.getItem("supervie-pending-list-mutations") ?? "[]")); }
async function itemCount(listId, label) {
  const data = await (await fetch(`${base}/api/lists`, { headers })).json();
  return data.lists.find((list) => list.id === listId).items.filter((item) => item.label === label).length;
}
async function pair() {
  const context = await browser.newContext();
  const a = await context.newPage(); const b = await context.newPage();
  for (const page of [a, b]) {
    await page.goto(base, { waitUntil: "networkidle", timeout: 10_000 });
    if (await page.getByLabel("Code d’accès").count()) {
      await page.getByLabel("Code d’accès").fill("supervie");
      await page.getByRole("button", { name: "Entrer" }).click();
    }
    await page.getByRole("button", { name: /AJOUTER UN ARTICLE/i }).click();
  }
  return { context, a, b };
}
async function add(page, label) {
  await page.locator("textarea").fill(label);
  await page.getByRole("button", { name: /^Ajouter la liste$/i }).click();
}

try {
  console.log("[multi-tab] build");
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "ignore" });
  run("d1", "migrations", "apply", "site-creator-d1", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json");
  worker = spawn(bin, ["dev", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json", "--port", String(port), "--var", "SUPERVIE_ACCESS_CODE:supervie"], { cwd: root, stdio: "ignore" });
  await ready();
  const listId = (await (await fetch(`${base}/api/lists`, { headers })).json()).lists[0].id;
  browser = await chromium.launch();

  {
    const { context, a, b } = await pair(); const gate = deferred(); const requests = [];
    for (const page of [a, b]) await page.route("**/api/lists", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests.push({ key: route.request().headers()["x-supervie-mutation-id"] ?? "", body: route.request().postData() ?? "" });
      await gate.promise; return route.continue();
    });
    await Promise.all([add(a, "onglet-a"), add(b, "onglet-b")]);
    await waitFor(async () => (await journal(a)).length === 2, 3_000, "les deux opérations distinctes ne sont pas conservées");
    const pending = await journal(a); assert.deepEqual(pending.map((entry) => entry.action.labels[0]).sort(), ["onglet-a", "onglet-b"]);
    gate.resolve();
    await waitFor(async () => (await itemCount(listId, "onglet-a")) === 1 && (await itemCount(listId, "onglet-b")) === 1, 5_000, "écritures distinctes absentes");
    await waitFor(async () => (await journal(a)).length === 0, 3_000, "journal non nettoyé après les deux confirmations");
    assert.equal(new Set(requests.map((request) => request.key)).size, 2);
    console.log("[multi-tab] opérations distinctes : 2 entrées conservées, 2 écritures"); await context.close();
  }

  {
    const { context, a, b } = await pair(); const gate = deferred(); const requests = [];
    await a.route("**/api/lists", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests.push({ key: route.request().headers()["x-supervie-mutation-id"] ?? "", body: route.request().postData() ?? "" });
      await route.fetch(); return route.abort();
    });
    await b.route("**/api/lists", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests.push({ key: route.request().headers()["x-supervie-mutation-id"] ?? "", body: route.request().postData() ?? "" });
      await gate.promise; return route.continue();
    });
    await add(a, "incertain-partage");
    await waitFor(async () => (await journal(a))[0]?.status === "uncertain", 3_000, "résultat incertain non persisté");
    assert.deepEqual(await journal(b), await journal(a), "le second onglet ne voit pas l'opération incertaine");
    gate.resolve();
    await waitFor(async () => (await journal(a)).length === 0, 5_000, "reprise incertaine non confirmée");
    assert.equal(await itemCount(listId, "incertain-partage"), 1);
    assert.ok(requests.length >= 2); assert.equal(new Set(requests.map((request) => request.key)).size, 1); assert.equal(new Set(requests.map((request) => request.body)).size, 1);
    console.log(`[multi-tab] incertaine : ${requests.length} envois, même clé, une exécution métier`); await context.close();
  }

  {
    const { context, a, b } = await pair(); const aGate = deferred(); const bGate = deferred();
    await a.route("**/api/lists", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch(); await aGate.promise; return route.fulfill({ response });
    });
    await b.route("**/api/lists", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch(); await bGate.promise; return route.fulfill({ response });
    });
    await add(a, "confirme-a"); await waitFor(async () => (await itemCount(listId, "confirme-a")) === 1, 3_000, "commit A absent");
    await add(b, "conserve-b"); await waitFor(async () => (await journal(a)).length === 2, 3_000, "journal sans les deux opérations");
    aGate.resolve();
    await waitFor(async () => (await journal(a)).length === 1, 3_000, "confirmation A a supprimé l'opération B");
    assert.equal((await journal(a))[0].action.labels[0], "conserve-b");
    bGate.resolve(); await waitFor(async () => (await journal(a)).length === 0, 3_000, "B non confirmée");
    assert.equal(await itemCount(listId, "conserve-b"), 1);
    console.log("[multi-tab] confirmation concurrente : suppression ciblée"); await context.close();
  }

  {
    const { context, a, b } = await pair(); const requests = []; let first = true;
    for (const page of [a, b]) await page.route("**/api/lists", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests.push({ at: Date.now(), key: route.request().headers()["x-supervie-mutation-id"] ?? "", body: route.request().postData() ?? "" });
      if (first) { first = false; return route.fulfill({ status: 429, headers: { "retry-after": "2", "content-type": "application/json" }, body: '{"error":"Trop de tentatives"}' }); }
      return route.continue();
    });
    await add(a, "limite-partagee"); await waitFor(async () => (await journal(a))[0]?.status === "rate_limited", 3_000, "429 non partagé");
    const limited = (await journal(a))[0]; assert.deepEqual(await journal(b), [limited]);
    await new Promise((resolve) => setTimeout(resolve, 800)); assert.equal(requests.length, 1, "second onglet a contourné l'échéance");
    await waitFor(() => requests.length === 2, 4_000, "reprise partagée absente");
    assert.ok(requests[1].at >= limited.nextAttemptAt - 250); assert.equal(requests[0].key, requests[1].key);
    await waitFor(async () => (await journal(a)).length === 0, 3_000, "journal rate limited non nettoyé"); assert.equal(await itemCount(listId, "limite-partagee"), 1);
    console.log("[multi-tab] rate limited : échéance partagée, un rejeu"); await context.close();
  }

  {
    const { context, a, b } = await pair(); const requests = []; let first = true;
    for (const page of [a, b]) await page.route("**/api/lists", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests.push({ at: Date.now(), key: route.request().headers()["x-supervie-mutation-id"] ?? "" });
      if (first) { first = false; return route.fulfill({ status: 429, headers: { "retry-after": "2", "content-type": "application/json" }, body: '{"error":"Trop de tentatives"}' }); }
      return route.continue();
    });
    await add(a, "fermeture-onglet"); await waitFor(async () => (await journal(a))[0]?.status === "rate_limited", 3_000, "429 initial absent");
    const pending = (await journal(a))[0]; await a.close();
    await waitFor(() => requests.length === 2, 4_000, "l'onglet restant n'a pas repris l'opération");
    assert.ok(requests[1].at >= pending.nextAttemptAt - 250); assert.equal(requests[0].key, requests[1].key);
    await waitFor(async () => (await journal(b)).length === 0, 3_000, "journal non nettoyé après fermeture du premier onglet");
    assert.equal(await itemCount(listId, "fermeture-onglet"), 1);
    console.log("[multi-tab] fermeture : reprise par l'onglet restant"); await context.close();
  }
} finally {
  await browser?.close(); worker?.kill(); rmSync(state, { recursive: true, force: true });
}
