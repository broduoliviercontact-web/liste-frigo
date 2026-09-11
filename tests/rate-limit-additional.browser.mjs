import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const state = mkdtempSync(join(tmpdir(), "friiigooo-rate-limit-additional-"));
const port = 8796;
const base = `http://127.0.0.1:${port}`;
const bin = join(root, "node_modules/.bin/wrangler");
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
async function listItems(listId, label) {
  const data = await (await fetch(`${base}/api/lists`, { headers })).json();
  return data.lists.find((list) => list.id === listId).items.filter((item) => item.label === label);
}
async function waitFor(check, timeout, message) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}
async function authenticatedPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "networkidle", timeout: 10_000 });
  await page.getByLabel("Code d’accès").fill("supervie");
  await page.getByRole("button", { name: "Entrer" }).click();
  await page.getByRole("button", { name: /AJOUTER UN ARTICLE/i }).click();
  return { context, page };
}
async function journal(page) { return page.evaluate(() => JSON.parse(localStorage.getItem("supervie-pending-list-mutations") ?? "[]")); }

try {
  console.log("[rate-limit-additional] build");
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "ignore" });
  run("d1", "migrations", "apply", "site-creator-d1", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json");
  worker = spawn(bin, ["dev", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json", "--port", String(port), "--var", "SUPERVIE_ACCESS_CODE:supervie"], { cwd: root, stdio: "ignore" });
  await ready();
  const listId = (await (await fetch(`${base}/api/lists`, { headers })).json()).lists[0].id;
  browser = await chromium.launch();

  {
    const { context, page } = await authenticatedPage();
    const attempts = [];
    const deadline = new Date(Math.ceil((Date.now() + 4_000) / 1_000) * 1_000);
    let first = true;
    await page.route("**/api/lists", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const attempt = { at: Date.now(), key: route.request().headers()["x-supervie-mutation-id"] ?? "", body: route.request().postData() ?? "" };
      attempts.push(attempt);
      if (first) { first = false; return route.fulfill({ status: 429, headers: { "retry-after": deadline.toUTCString(), "content-type": "application/json" }, body: '{"error":"Trop de tentatives"}' }); }
      return route.continue();
    });
    await page.locator("textarea").fill("date-http");
    await page.getByRole("button", { name: /^Ajouter la liste$/i }).click();
    await page.getByRole("status").filter({ hasText: /Action reportée temporairement/ }).waitFor({ timeout: 5_000 });
    const saved = await journal(page);
    assert.equal(saved[0].status, "rate_limited");
    assert.ok(Math.abs(saved[0].nextAttemptAt - deadline.getTime()) < 250, "l'échéance doit correspondre à la date HTTP, précision de 250 ms");
    await page.waitForTimeout(1_000);
    assert.equal(attempts.length, 1, "aucun rejeu avant la date HTTP");
    await waitFor(() => attempts.length === 2, 6_000, "rejeu date HTTP absent");
    assert.ok(attempts[1].at >= deadline.getTime() - 250, "tolérance de 250 ms pour l'horloge et les timers");
    assert.equal(attempts[1].key, attempts[0].key); assert.equal(attempts[1].body, attempts[0].body);
    await page.waitForFunction(() => localStorage.getItem("supervie-pending-list-mutations") === "[]", null, { timeout: 5_000 });
    assert.equal((await listItems(listId, "date-http")).length, 1);
    console.log(`[rate-limit-additional] date HTTP : ${attempts[1].at - deadline.getTime()}ms relatif à l'échéance`);
    await context.close();
  }

  {
    const { context, page } = await authenticatedPage();
    const attempts = [];
    let first = true;
    await page.route("**/api/lists", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      attempts.push({ at: Date.now(), key: route.request().headers()["x-supervie-mutation-id"] ?? "", body: route.request().postData() ?? "" });
      if (first) { first = false; return route.fulfill({ status: 429, headers: { "retry-after": "4", "content-type": "application/json" }, body: '{"error":"Trop de tentatives"}' }); }
      return route.continue();
    });
    await page.locator("textarea").fill("rechargement-429");
    await page.getByRole("button", { name: /^Ajouter la liste$/i }).click();
    await page.getByRole("status").filter({ hasText: /Action reportée temporairement/ }).waitFor({ timeout: 5_000 });
    const beforeReload = await journal(page);
    assert.equal(beforeReload[0].status, "rate_limited");
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "networkidle", timeout: 10_000 });
    const afterReload = await journal(page);
    assert.deepEqual(afterReload, beforeReload, "rechargement conserve clé, contenu, compteur et échéance");
    await page.waitForTimeout(1_000);
    assert.equal(attempts.length, 1, "aucune reprise pendant l'attente restaurée");
    await waitFor(() => attempts.length === 2, 6_000, "rejeu après rechargement absent");
    assert.ok(attempts[1].at >= beforeReload[0].nextAttemptAt - 250, "rejeu pas avant nextAttemptAt (tolérance 250 ms)");
    assert.equal(attempts[1].key, attempts[0].key); assert.equal(attempts[1].body, attempts[0].body);
    await page.waitForFunction(() => localStorage.getItem("supervie-pending-list-mutations") === "[]", null, { timeout: 5_000 });
    assert.equal((await listItems(listId, "rechargement-429")).length, 1);
    console.log(`[rate-limit-additional] rechargement : délai=${attempts[1].at - attempts[0].at}ms`);
    await context.close();
  }

  {
    const { context, page } = await authenticatedPage();
    const attempts = [];
    await page.route("**/api/lists", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      attempts.push({ at: Date.now(), key: route.request().headers()["x-supervie-mutation-id"] ?? "", body: route.request().postData() ?? "" });
      return route.fulfill({ status: 429, headers: { "retry-after": "1", "content-type": "application/json" }, body: '{"error":"Trop de tentatives"}' });
    });
    await page.locator("textarea").fill("epuise-429");
    await page.getByRole("button", { name: /^Ajouter la liste$/i }).click();
    await waitFor(() => attempts.length === 4, 7_000, "les trois reprises automatiques n'ont pas été observées");
    await page.getByRole("status").filter({ hasText: /Action en attente de votre confirmation/ }).waitFor({ timeout: 2_000 });
    const exhausted = await journal(page);
    assert.equal(exhausted[0].status, "rate_limited"); assert.equal(exhausted[0].retryCount, 3);
    assert.equal(new Set(attempts.map((attempt) => attempt.key)).size, 1, "aucune nouvelle clé");
    assert.equal(new Set(attempts.map((attempt) => attempt.body)).size, 1, "aucun nouveau contenu");
    await page.waitForTimeout(1_500);
    assert.equal(attempts.length, 4, "aucun timer supplémentaire après la limite");
    assert.equal((await listItems(listId, "epuise-429")).length, 0);
    await page.reload({ waitUntil: "networkidle", timeout: 10_000 });
    assert.deepEqual(await journal(page), exhausted, "rechargement ne remet pas le compteur à zéro");
    await page.waitForTimeout(1_500);
    assert.equal(attempts.length, 4, "rechargement ne doit pas reprendre une opération épuisée");
    assert.equal((await listItems(listId, "epuise-429")).length, 0);
    console.log(`[rate-limit-additional] épuisement : ${attempts.length} tentatives, aucune écriture`);
    await context.close();
  }
} finally {
  await browser?.close();
  worker?.kill();
  rmSync(state, { recursive: true, force: true });
}
