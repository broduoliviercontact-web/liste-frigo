import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const state = mkdtempSync(join(tmpdir(), "friiigooo-rejected-"));
const port = 8794;
const base = `http://127.0.0.1:${port}`;
const bin = join(root, "node_modules/.bin/wrangler");
let worker;
let browser;
let workerOutput = "";

function run(...args) {
  return execFileSync(bin, args, { cwd: root, encoding: "utf8", input: "y\n", env: { ...process.env, CI: "true" } });
}

function mutationRow(id) {
  const output = run("d1", "execute", "site-creator-d1", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json", "--command", `SELECT outcome FROM list_mutations WHERE id = '${id}'`, "--json");
  const parsed = JSON.parse(output.slice(output.indexOf("[")));
  return parsed[0]?.results?.[0] ?? null;
}

async function ready() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(300) })).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Worker indisponible");
}

try {
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "ignore" });
  run("d1", "migrations", "apply", "site-creator-d1", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json");
  worker = spawn(bin, ["dev", "--local", "--persist-to", state, "--config", "dist/server/wrangler.json", "--port", String(port), "--var", "SUPERVIE_ACCESS_CODE:supervie"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  worker.stdout.on("data", (chunk) => { workerOutput += chunk; });
  worker.stderr.on("data", (chunk) => { workerOutput += chunk; });
  await ready();

  const initial = await (await fetch(`${base}/api/lists`, { headers: { "x-supervie-access-code": "supervie" } })).json();
  const listId = initial.lists[0].id;

  const headers = {
    "content-type": "application/json",
    "x-supervie-access-code": "supervie",
    "x-supervie-mutation-id": "fill-200-items-0001",
  };
  const seed = await fetch(`${base}/api/lists`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "addItems", listId, labels: Array.from({ length: 200 }, (_, index) => `f${index}`) }),
  });
  const seedBody = await seed.text();
  console.log("[rejected] seed", seed.status, seed.status === 200 ? "200 articles créés" : seedBody);
  if (seed.status !== 200) console.log("[rejected] worker", workerOutput);
  assert.equal(seed.status, 200);

  browser = await chromium.launch();
  const page = await browser.newPage();
  const mutationResponses = [];
  const mutationRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/lists") && request.method() === "POST") mutationRequests.push({ headers: request.headers(), body: request.postData() });
  });
  page.on("response", async (response) => {
    if (response.url().includes("/api/lists") && response.request().method() === "POST") mutationResponses.push({ status: response.status(), body: await response.text() });
  });

  await page.goto(base);
  await page.getByLabel("Code d’accès").fill("supervie");
  await page.getByRole("button", { name: "Entrer" }).click();
  await page.getByRole("button", { name: /AJOUTER UN ARTICLE/i }).click();
  await page.locator("textarea").fill("refusé");
  const refusal = page.waitForResponse((response) => response.url().includes("/api/lists") && response.request().method() === "POST", { timeout: 5_000 });
  await page.getByRole("button", { name: /^Ajouter la liste$/i }).click();
  assert.equal((await refusal).status(), 400);
  await page.waitForTimeout(100);
  console.log("[rejected] response", JSON.stringify(mutationResponses));
  console.log("[rejected] journal", await page.evaluate(() => localStorage.getItem("supervie-pending-list-mutations")));
  console.log("[rejected] dialog", await page.locator('[role="dialog"]').innerText());

  await page.getByRole("dialog", { name: "Ajouter un article" }).getByRole("alert").filter({ hasText: /Action non appliquée/ }).waitFor({ timeout: 5_000 });
  const data = await (await fetch(`${base}/api/lists`, { headers: { "x-supervie-access-code": "supervie" } })).json();
  assert.equal(data.lists[0].items.length, 200);
  assert.equal(data.lists[0].items.some((item) => item.label === "refusé"), false);
  const journal = await page.evaluate(() => localStorage.getItem("supervie-pending-list-mutations"));
  assert.ok(journal?.includes('"rejected"'));
  assert.ok(journal?.includes("200 articles maximum par liste"));
  assert.equal(mutationRow(mutationRequests[0].headers["x-supervie-mutation-id"])?.outcome, "rejected");
  assert.equal(mutationRequests.length, 1);

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("paragraph").filter({ hasText: /Action non appliquée/ }).waitFor({ timeout: 5_000 });
  await page.waitForTimeout(1_200);
  assert.equal(mutationRequests.length, 1);
  const persistedJournal = await page.evaluate(() => localStorage.getItem("supervie-pending-list-mutations"));
  assert.ok(persistedJournal?.includes('"rejected"'));
  assert.ok(persistedJournal?.includes("200 articles maximum par liste"));
  const afterReload = await (await fetch(`${base}/api/lists`, { headers: { "x-supervie-access-code": "supervie" } })).json();
  assert.equal(afterReload.lists[0].items.length, 200);
  assert.equal(afterReload.lists[0].items.some((item) => item.label === "refusé"), false);
  console.log("[rejected] persistent refusal");
} finally {
  await browser?.close();
  worker?.kill();
  rmSync(state, { recursive: true, force: true });
}
