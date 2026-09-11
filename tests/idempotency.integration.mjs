import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const builtConfig = "dist/server/wrangler.json";
const state = mkdtempSync(join(tmpdir(), "friiigooo-idempotency-"));
const port = 8791;
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
async function post(body, id) {
  const response = await fetch(`${base}/api/lists`, { method: "POST", headers: { ...headers, "x-supervie-mutation-id": id }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function lists() { return (await (await fetch(`${base}/api/lists`, { headers })).json()).lists; }
function mutationRow(id) {
  const output = wrangler("d1", "execute", "site-creator-d1", "--local", "--persist-to", state, "--config", builtConfig, "--command", `SELECT outcome, request_hash FROM list_mutations WHERE id = '${id}'`, "--json");
  const parsed = JSON.parse(output.slice(output.indexOf("[")));
  return parsed[0]?.results?.[0] ?? null;
}

test.before(async () => {
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "ignore" });
  wrangler("d1", "migrations", "apply", "site-creator-d1", "--local", "--persist-to", state, "--config", builtConfig);
  worker = spawn(join(root, "node_modules/.bin/wrangler"), ["dev", "--local", "--persist-to", state, "--config", builtConfig, "--port", String(port), "--var", "SUPERVIE_ACCESS_CODE:supervie"], { cwd: root, stdio: "ignore" });
  await waitReady();
});
test.after(() => { worker?.kill(); rmSync(state, { recursive: true, force: true }); });

test("même clé simultanée : une écriture, deux résultats cohérents", async () => {
  const action = { action: "addItem", listId: 1, label: "unique" };
  const [a, b] = await Promise.all([post(action, "same-key-00000001"), post(action, "same-key-00000001")]);
  assert.deepEqual([a.status, b.status].sort(), [200, 200]);
  assert.equal((await lists())[0].items.filter((item) => item.label === "unique").length, 1);
});

test("clé différente de son contenu : conflit sans seconde écriture", async () => {
  const result = await post({ action: "addItem", listId: 1, label: "autre" }, "same-key-00000001");
  assert.equal(result.status, 409);
  assert.equal((await lists())[0].items.filter((item) => item.label === "autre").length, 0);
});

test("refus mémorisé à 200 articles", async () => {
  const fill = await post({ action: "addItems", listId: 2, labels: Array.from({ length: 200 }, (_, i) => `i${i}`) }, "fill-list-00000001");
  assert.equal(fill.status, 200);
  const action = { action: "addItem", listId: 2, label: "refus" };
  assert.equal((await post(action, "rejected-key-00001")).status, 400);
  assert.equal((await post(action, "rejected-key-00001")).status, 400);
  assert.equal((await lists())[1].items.length, 200);
  assert.equal(mutationRow("rejected-key-00001")?.outcome, "rejected");
});

test("plafond de 40 listes : refus et rejeu", async () => {
  for (let i = 0; i < 37; i += 1) assert.equal((await post({ action: "createList", name: `L${i}` }, `list-fill-${String(i).padStart(8, "0")}`)).status, 200);
  const action = { action: "createList", name: "trop" };
  assert.equal((await post(action, "list-reject-000001")).status, 400);
  assert.equal((await post(action, "list-reject-000001")).status, 400);
  assert.equal((await lists()).length, 40);
  assert.equal(mutationRow("list-reject-000001")?.outcome, "rejected");
});

test("à 199 articles, même clé ajoute une seule ligne", async () => {
  const target = (await lists())[2].id;
  assert.equal((await post({ action: "addItems", listId: target, labels: Array.from({ length: 199 }, (_, i) => `p${i}`) }, "fill-199-items-001")).status, 200);
  const action = { action: "addItem", listId: target, label: "deux-fois" };
  const results = await Promise.all([post(action, "at-199-same-key01"), post(action, "at-199-same-key01")]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 200]);
  assert.equal((await lists()).find((list) => list.id === target).items.length, 200);
});

test("import trop grand ne laisse aucune insertion partielle", async () => {
  const target = (await lists())[2].id;
  const action = { action: "addItems", listId: target, labels: ["x", "y"] };
  assert.equal((await post(action, "import-reject-00001")).status, 400);
  assert.equal((await post(action, "import-reject-00001")).status, 400);
  assert.equal((await lists()).find((list) => list.id === target).items.length, 200);
  assert.equal(mutationRow("import-reject-00001")?.outcome, "rejected");
});

test("erreur SQL : batch annulé et clé non conservée", async () => {
  const action = { action: "addItem", listId: 999999, label: "fk" };
  assert.equal((await post(action, "sql-rollback-00001")).status, 500);
  assert.equal((await post(action, "sql-rollback-00001")).status, 500);
  assert.equal((await lists()).flatMap((list) => list.items).filter((item) => item.label === "fk").length, 0);
  assert.equal(mutationRow("sql-rollback-00001"), null);
});

test("réponse perdue après commit : rejeu sans doublon", async () => {
  const action = { action: "addItem", listId: 1, label: "perdue" };
  await post(action, "lost-response-00001"); // réponse volontairement ignorée après commit
  const replay = await post(action, "lost-response-00001");
  assert.equal(replay.status, 200);
  assert.equal((await lists())[0].items.filter((item) => item.label === "perdue").length, 1);
});

test("refus conservé après capacité libérée, nouvelle clé admise", async () => {
  const target = (await lists())[1];
  const action = { action: "addItem", listId: target.id, label: "après-place" };
  assert.equal((await post(action, "still-rejected-001")).status, 400);
  const item = target.items[0];
  assert.equal((await post({ action: "deleteItem", id: item.id }, "free-space-0000001")).status, 200);
  assert.equal((await post(action, "still-rejected-001")).status, 400);
  assert.equal((await post(action, "new-key-after-space")).status, 200);
});
