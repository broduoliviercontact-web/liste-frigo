import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Run the actual routes with a controlled clock and only external I/O replaced.
function load(relative, dependencies, clock) {
  const exports = {};
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const code = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Date: Clock, Response, Request, URL, setTimeout, clearTimeout,
    console: { error() {} },
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
const NOW = Date.parse('2026-09-11T14:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
function line(times) {
  return { id: 'm5', label: '5', mode: 'metro', stop: 'Raymond Queneau', available: true,
    passages: times.map(time => ({ time: typeof time === 'number' ? iso(time) : time, destination: 'Bobigny' })) };
}
function harness({ updatedAt = iso(NOW), checkedAt = NOW, times = [NOW + 180000], key = '', fails = false, live = false, limited = false, partial = false } = {}) {
  const clock = { now: NOW };
  let providerFails = fails;
  const policy = load('../app/api/transit/state.ts', {}, clock);
  let row = { updated_at: updatedAt, checked_at: checkedAt, payload: JSON.stringify([line(times)]) };
  let requests = 0;
  let saves = 0;
  const sqlDb = new DatabaseSync(':memory:');
  sqlDb.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  const env = { IDFM_PRIM_API_KEY: key, DB: { prepare(sql) {
    if(sql.includes('app_settings')) {
      let values = []; const statement = sqlDb.prepare(sql);
      return { bind(...args) { values=args; return this; }, async first() { return statement.get(...values) ?? null; }, async run() { return statement.run(...values); } };
    }
    let args;
    return {
      bind(...values) { args = values; return this; },
      async first() { return row; },
      async run() {
        if (sql.startsWith('INSERT')) {
          saves++;
          row = { updated_at: args[1], checked_at: args[2], payload: args[3] };
        }
      },
    };
  } } };
  const gate = load('../app/api/transit/refresh.ts', { 'cloudflare:workers': {env} }, clock);
  const newRoute = () => load('../app/api/transit/route.ts', {
    '../../access': { requireSupervieAccess: async () => null },
    '../fetch-with-timeout': { fetchWithTimeout: async (input) => {
      const url = new URL(input);
      assert.deepEqual([...url.searchParams.keys()].sort(), ["LineRef", "MonitoringRef"]);
      requests++;
      if(limited || (partial && url.searchParams.get('MonitoringRef').includes('22014'))) return new Response('', {status:429, headers:{'retry-after':'1800'}});
      if (providerFails) throw new Error('PRIM unavailable');
      return Response.json({ Siri: { ServiceDelivery: { StopMonitoringDelivery: [{ MonitoredStopVisit: live ? [{ MonitoredVehicleJourney: { DestinationName: [{ value: "Bobigny" }], MonitoredCall: { ExpectedDepartureTime: iso(NOW + 60 * 60000) } } }] : [] }] } } });
    } },
    './state': policy, './refresh': gate,
    'cloudflare:workers': { env },
  }, clock);
  return { route: newRoute(), newRoute, gate, policy, clock, failProvider: () => { providerFails = true; }, requests: () => requests, saves: () => saves, clearSnapshot: () => { row = null; } };
}
const request = () => new Request('https://local/api/transit');

test('future departures yield exact positive JSON integers; zero only now or imminent', async () => {
  const h = harness({ times: [NOW, NOW + 20000, NOW + 180000, NOW + 420000, NOW + 720000] });
  const api = await (await h.route.GET(request())).json();
  const epaper = JSON.parse(JSON.stringify(h.policy.epaperTransit(api)));
  assert.equal(epaper.status, 'ready');
  assert.deepEqual(epaper.lines[0].directions[0].minutes, [0, 0, 3, 7, 12]);
  assert.ok(epaper.lines[0].directions[0].minutes.every(v => typeof v === 'number' && Number.isInteger(v)));
});

test('transit excludes >1 minute past; e-paper excludes ALL negative delays (including negative zero)', async () => {
  const h = harness({ times: [NOW - 60001, NOW - 60000, NOW - 45000, NOW - 1, 'invalid'] });
  const api = await (await h.route.GET(request())).json();
  assert.equal(api.lines[0].passages.length, 3);
  const epaper = h.policy.epaperTransit(api);
  assert.equal(epaper.status, 'unavailable');
  assert.equal(epaper.lines[0].available, false);
  assert.equal(epaper.lines[0].directions.length, 0);
});

test('September 2 snapshot cannot be rejuvenated by recent checked_at', async () => {
  const h = harness({ updatedAt: '2026-09-02T14:28:21.826Z', times: [NOW + 600000] });
  const api = await (await h.route.GET(request())).json();
  assert.equal(api.status, 'unavailable');
  assert.equal(api.updatedAt, '2026-09-02T14:28:21.826Z');
  assert.equal(api.lines.every(l => !l.available && l.passages.length === 0), true);
  assert.equal(h.policy.epaperTransit(api).status, 'unavailable');
});

test('provider outage with expired snapshot yields unavailable without refreshing D1', async () => {
  const h = harness({ updatedAt: iso(NOW - 1200001), checkedAt: NOW - 1200001, key: 'fake', fails: true });
  const api = await (await h.route.GET(request())).json();
  assert.ok(h.requests() > 0);
  assert.equal(h.saves(), 0);
  assert.equal(api.status, 'unavailable');
  assert.equal(api.lines.every(l => !l.available && l.passages.length === 0), true);
});

test('memory cache revalidates both departures and snapshot age on every read', async () => {
  const h = harness({ updatedAt: iso(NOW - 19 * 60000), times: [NOW + 30 * 60000] });
  assert.equal((await h.route.readTransit()).status, 'ready');
  h.clock.now += 60001;
  assert.equal((await h.route.readTransit()).status, 'unavailable');
  const p = harness({ times: [NOW + 60000] });
  assert.equal((await p.route.readTransit()).status, 'ready');
  p.clock.now += 120001;
  assert.equal((await p.route.readTransit()).status, 'unavailable');
});

test('20-minute boundary, invalid and future snapshot timestamps fail closed', () => {
  const { policy } = harness();
  assert.equal(policy.isFreshTransit(iso(NOW - 1200000)), true);
  assert.equal(policy.isFreshTransit(iso(NOW - 1200001)), false);
  assert.equal(policy.isFreshTransit('invalid'), false);
  assert.equal(policy.isFreshTransit(iso(NOW + 1)), false);
});

test('actual e-paper GET rejects stale transit even when its source promise resolves successfully', async () => {
  const h = harness();
  const dependencies = {
    '../../../transit/state': h.policy,
    '../../../lists/route': { readAll: async () => [] },
    '../../../meals/route': { readWeekMeals: async () => ({}) },
    '../weather': { readPantinWeather: async () => ({}) },
    '../../../transit/route': { readTransit: async () => ({ updatedAt: '2026-09-02T14:28:21.826Z', lines: [line([NOW + 60000])] }) },
    '../../../../access': { requireSupervieAccess: async () => null },
    '../../../iss/route': { readIss: async () => ({}) },
    '../../../air/route': { readAirTraffic: async () => ({ aircraft: [] }) },
    '../../../agenda/route': { readWeekAgenda: async () => ({ upcoming: [], days: [] }) },
    '../../../boats/route': { readBoats: async () => ({ boats: [] }) },
    '../../../../../server/services/aisService': { BOATS_ROUTE: {} },
    '../../../epaper-settings/settings': { DEFAULT_EPAPER_SETTINGS: {}, readEpaperSettings: async () => ({}) },
    'cloudflare:workers': { env: {} },
  };
  const route = load('../app/api/epaper/v1/state/route.ts', dependencies, h.clock);
  const response = await route.GET(new Request('https://local/api/epaper/v1/state'));
  assert.equal(response.status, 200);
  const { pages } = await response.json();
  assert.equal(pages.metro.status, 'unavailable');
  assert.deepEqual(pages.metro.lines[0].directions, []);
  assert.equal(pages.listes.status, 'ready');
  dependencies['../../../transit/route'].readTransit = async () => ({ updatedAt: iso(NOW), lines: [line([NOW, NOW + 180000, NOW + 420000, NOW + 720000])] });
  const fresh = await (await route.GET(new Request('https://local/api/epaper/v1/state'))).json();
  assert.equal(fresh.pages.metro.status, 'ready');
  assert.deepEqual(fresh.pages.metro.lines[0].directions[0].minutes, [0, 3, 7, 12]);
  dependencies['../../../transit/route'].readTransit = async () => { throw new Error('transit source failed'); };
  const failed = await (await route.GET(new Request('https://local/api/epaper/v1/state'))).json();
  assert.equal(failed.pages.metro.status, 'unavailable');
  assert.deepEqual(failed.pages.metro.lines, []);
  assert.equal(failed.pages.listes.status, 'ready');
});

test('last successful in-memory fallback also expires after 20 minutes', async () => {
  const h = harness({ updatedAt: iso(NOW - 1200001), checkedAt: 0, key: 'fake', live: true });
  assert.equal((await h.route.readTransit()).status, 'ready');
  assert.equal(h.saves(), 1);
  h.clearSnapshot();
  h.failProvider();
  h.clock.now = NOW + 19 * 60000;
  assert.equal((await h.route.readTransit()).status, 'ready');
  h.clock.now = NOW + 20 * 60000 + 1;
  assert.equal((await h.route.readTransit()).status, 'unavailable');
  h.clock.now = NOW + 25 * 60000;
  assert.equal((await h.route.readTransit()).status, 'unavailable');
  assert.equal(h.saves(), 1);
});


test('shared SQLite gate: cold Workers and concurrent calls obey 429 deadline without aging snapshot forward', async () => {
 const h=harness({updatedAt:iso(NOW-3600000),checkedAt:0,key:'fake',limited:true});
 const results=await Promise.all([h.route.readTransit(),h.newRoute().readTransit(),h.newRoute().readTransit()]);
 assert.equal(h.requests(),8); assert.equal(h.saves(),0);
 assert.ok(results.every(r=>r.status==='unavailable'));
 const after=await h.newRoute().readTransit();
 assert.equal(after.reason,'rate_limited'); assert.equal(after.nextAttemptAt,NOW+1800000);
 assert.equal(after.updatedAt,iso(NOW-3600000));
 h.clock.now=NOW+1799999;
 assert.equal((await h.newRoute().readTransit()).status,'unavailable'); assert.equal(h.requests(),8);
 h.clock.now++;
 await h.newRoute().readTransit(); assert.equal(h.requests(),16);
});

test('one failed stop does not discard valid departures at the other stop', async () => {
 const h=harness({updatedAt:iso(NOW-3600000),checkedAt:0,key:'fake',live:true,partial:true});
 const result=await h.route.readTransit();
 assert.equal(result.status,'ready'); assert.equal(result.lines[0].available,true);
 assert.equal(result.reason,'rate_limited'); assert.equal(result.nextAttemptAt,NOW+1800000);
});

test('shared reservation survives an interrupted Worker and rejects an obsolete completion', async () => {
 const h=harness();
 const reservation=await h.gate.claimTransitRefresh(NOW,600000);
 assert.equal(await h.gate.claimTransitRefresh(NOW,600000),null);
 h.clock.now=NOW+600001;
 const second=await h.gate.claimTransitRefresh(h.clock.now,600000);
 await h.gate.finishTransitRefresh(reservation,{reason:'ready',nextAttemptAt:0});
 assert.equal((await h.gate.readTransitRefresh()).nextAttemptAt,second);
});
