import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const state = mkdtempSync(join(tmpdir(), "friiigooo-rate-limit-seconds-"));
const port = 8795;
const base = `http://127.0.0.1:${port}`;
const bin = join(root, "node_modules/.bin/wrangler");
const accessHeaders = { "x-supervie-access-code": "supervie" };
let worker;
let browser;

function run(...args) {
  return execFileSync(bin, args, { cwd: root, encoding: "utf8", input: "y\n", env: { ...process.env, CI: "true" } });
}

async function ready() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/lists`, { headers: accessHeaders, signal: AbortSignal.timeout(300) })).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Worker indisponible");
}

try {
  console.log("[rate-limit-seconds] build");
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "ignore" });
  run("d1", "migrations", "apply", "site-creator-d1", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json");
  worker = spawn(bin, ["dev", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json", "--port", String(port), "--var", "SUPERVIE_ACCESS_CODE:supervie"], { cwd: root, stdio: "ignore" });
  await ready();
  const lists = await (await fetch(`${base}/api/lists`, { headers: accessHeaders })).json();
  const listId = lists.lists[0].id;

  browser = await chromium.launch();
  const page = await browser.newPage();
  const attempts = [];
  let firstAttemptAt = 0;
  let resolveReplay;
  const replay = new Promise((resolve) => { resolveReplay = resolve; });
  let interceptFirst = true;

  await page.route("**/api/lists", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const attempt = {
      at: Date.now(),
      key: route.request().headers()["x-supervie-mutation-id"] ?? "",
      body: route.request().postData() ?? "",
    };
    attempts.push(attempt);
    if (interceptFirst) {
      interceptFirst = false;
      firstAttemptAt = attempt.at;
      return route.fulfill({ status: 429, headers: { "retry-after": "3", "content-type": "application/json" }, body: '{"error":"Trop de tentatives"}' });
    }
    resolveReplay(attempt);
    return route.continue();
  });

  await page.goto(base, { waitUntil: "networkidle", timeout: 10_000 });
  await page.getByLabel("Code d’accès").fill("supervie");
  await page.getByRole("button", { name: "Entrer" }).click();
  await page.getByRole("button", { name: /AJOUTER UN ARTICLE/i }).click();
  await page.locator("textarea").fill("ralenti");
  await page.getByRole("button", { name: /^Ajouter la liste$/i }).click();

  await page.getByRole("dialog", { name: "Ajouter un article" }).getByRole("status").filter({ hasText: /Action reportée temporairement/ }).waitFor({ timeout: 5_000 });
  const journal = await page.evaluate(() => JSON.parse(localStorage.getItem("supervie-pending-list-mutations") ?? "[]"));
  assert.equal(journal.length, 1);
  assert.equal(journal[0].status, "rate_limited");
  assert.equal(journal[0].retryCount, 0, "le compteur mesure les reprises automatiques déjà effectuées, pas le refus initial");
  assert.equal(typeof journal[0].id, "string");
  assert.equal(journal[0].action.listId, listId);
  assert.deepEqual(journal[0].action.labels, ["ralenti"]);
  assert.equal(typeof journal[0].nextAttemptAt, "number");
  assert.ok(journal[0].nextAttemptAt - firstAttemptAt >= 2_700, "Retry-After=3 doit produire une échéance à au moins 2,7 s (tolérance 300 ms)");
  assert.ok(journal[0].nextAttemptAt - firstAttemptAt <= 3_300, "l'échéance ne doit pas dépasser 3,3 s");

  const before = await (await fetch(`${base}/api/lists`, { headers: accessHeaders })).json();
  assert.equal(before.lists.find((list) => list.id === listId).items.filter((item) => item.label === "ralenti").length, 0);
  await page.waitForTimeout(1_000);
  assert.equal(attempts.length, 1, "aucune reprise ne doit partir avant l'échéance");

  const replayAttempt = await Promise.race([
    replay,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Reprise automatique absente")), 5_000)),
  ]);
  const observedDelay = replayAttempt.at - firstAttemptAt;
  assert.ok(observedDelay >= 2_700, `rejeu envoyé ${observedDelay} ms après le 429 ; tolérance anticipée maximale : 300 ms`);
  assert.equal(replayAttempt.key, attempts[0].key);
  assert.equal(replayAttempt.body, attempts[0].body);
  await page.waitForFunction(() => localStorage.getItem("supervie-pending-list-mutations") === "[]", null, { timeout: 5_000 });
  await page.waitForTimeout(200);
  assert.equal(attempts.length, 2, "exactement un rejeu automatique est attendu");

  const after = await (await fetch(`${base}/api/lists`, { headers: accessHeaders })).json();
  assert.equal(after.lists.find((list) => list.id === listId).items.filter((item) => item.label === "ralenti").length, 1);
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.getByRole("button", { name: /Cocher ralenti/i }).waitFor({ timeout: 5_000 });
  console.log(`[rate-limit-seconds] délai observé=${observedDelay}ms, même clé et même contenu, une écriture`);
} finally {
  await browser?.close();
  worker?.kill();
  rmSync(state, { recursive: true, force: true });
}
