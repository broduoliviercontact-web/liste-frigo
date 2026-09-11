import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const builtConfig = "dist/server/wrangler.json";
const state = mkdtempSync(join(tmpdir(), "friiigooo-reliability-"));
const port = 8802;
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


async function settingsPost(body) { return fetch(`${base}/api/epaper-settings`, {method:'POST', headers, body:JSON.stringify(body)}); }
async function settingsGet() { return (await (await fetch(`${base}/api/epaper-settings`, {headers})).json()); }
test('settings: mandatory revision, concurrent CAS, partial update preserves fields', async () => {
 assert.equal((await settingsPost({activeTab:'iss'})).status,428);
 const initial=await settingsGet();
 const results=await Promise.all([settingsPost({revision:initial.revision,activeTab:'iss'}),settingsPost({revision:initial.revision,activeTab:'metro'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const first=await settingsGet();
 const hidden=first.visibleTabs.filter(tab=>tab!=='air');
 assert.equal((await settingsPost({revision:first.revision,visibleTabs:hidden})).status,200);
 const second=await settingsGet();
 assert.equal((await settingsPost({revision:second.revision,activeTab:'listes'})).status,200);
 assert.deepEqual((await settingsGet()).visibleTabs,hidden);
 assert.equal((await settingsPost({revision:first.revision,visibleTabs:first.visibleTabs})).status,409);
});
test('access: established sessions survive an exhausted guessing budget; legacy credentials remain bounded', async () => {
 const login=await fetch(`${base}/api/access`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'supervie'})});
 assert.equal(login.status,200);
 const session=login.headers.getSetCookie().find(value=>value.startsWith('supervie_session=')).split(';')[0];
 assert.match(session,/^supervie_session=[a-f0-9]{64}$/);
 const legacy=await fetch(`${base}/api/access`,{headers:{cookie:'supervie_access=supervie'}});
 assert.equal(legacy.status,200);
 assert.ok(legacy.headers.getSetCookie().some(value=>value.startsWith('supervie_session=')));
 assert.ok(legacy.headers.getSetCookie().some(value=>value.startsWith('supervie_access=;')&&value.includes('Max-Age=0')));
 // Place bucket immediately below the threshold without waiting a minute.
 const start=Math.floor(Date.now()/60000)*60000;
 wrangler('d1','execute','site-creator-d1','--local','--persist-to',state,'--config',builtConfig,'--command',`UPDATE access_attempts SET count=119,window_start=${start} WHERE key='global'`);
 const results=await Promise.all(Array.from({length:8},()=>fetch(`${base}/api/lists`,{headers:{'x-supervie-access-code':'wrong'}})));
 assert.equal(results.filter(r=>r.status===401).length,1); assert.equal(results.filter(r=>r.status===429).length,7);
 for (const [path,init] of [['/api/access',{method:'POST',headers:{'content-type':'application/json'},body:'{"code":"supervie"}'}],['/api/access',{headers:{cookie:'supervie_access=supervie'}}],['/api/lists',{headers}]]) {
  const response=await fetch(base+path,init);assert.equal(response.status,429);assert.ok(Number(response.headers.get('retry-after'))>0);
 }
 for(const path of ['/api/access','/api/lists']) assert.equal((await fetch(base+path,{headers:{cookie:session}})).status,200);
 assert.equal((await fetch(base+'/api/lists',{headers:{cookie:'supervie_session='+ 'a'.repeat(64)}})).status,429);
 wrangler('d1','execute','site-creator-d1','--local','--persist-to',state,'--config',builtConfig,'--command','UPDATE access_sessions SET expires_at=0');
 assert.equal((await fetch(base+'/api/lists',{headers:{cookie:session}})).status,429);
 wrangler('d1','execute','site-creator-d1','--local','--persist-to',state,'--config',builtConfig,'--command',`UPDATE access_attempts SET window_start=${start-60000} WHERE key='global'`);
 assert.equal((await fetch(base+'/api/lists',{headers:{cookie:session}})).status,401);
 assert.equal((await fetch(`${base}/api/lists`,{headers})).status,200);
});
