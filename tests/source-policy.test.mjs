import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as satellite from 'satellite.js';
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

test('ISS: fresh epoch, failure fallback, expiry, bounded attempts', async () => {
  const clock = { now: Date.parse('2026-09-11T14:00:00Z') };
  const policy = load('../app/api/source-policy.ts', {}, clock);
  let fail = false; let calls = 0;
  const route = load('../app/api/iss/route.ts', {
    '../source-policy': policy, '../../access': {}, 'satellite.js': satellite,
    '../fetch-with-timeout': { fetchWithTimeout: async () => {
      calls++; if (fail) throw new Error('offline');
      return new Response('1 25544U 98067A   26254.50000000  .00013495  00000+0  25209-3 0  9997\n2 25544  51.6292 245.3706 0004854 110.6068 249.5441 15.49061543584742');
    } },
  }, clock);
  const [first] = await Promise.all([route.readIss(), route.readIss()]);
  assert.equal(calls, 1); assert.equal(first.status, 'ready'); assert.equal(first.sourceAgeSeconds, 7200);
  fail = true; clock.now += 7 * 3600000;
  assert.equal((await route.readIss()).degraded, true);
  await route.readIss(); assert.equal(calls, 3);
  clock.now += 48 * 3600000;
  await assert.rejects(route.readIss(), /périmés/);
  const before = calls; await assert.rejects(route.readIss()); assert.equal(calls, before);
});
test('Retry-After: long seconds and HTTP date preserved; invalid defaults', () => {
  const clock = { now: 1789130000000 }; const p = load('../app/api/source-policy.ts', {}, clock);
  assert.equal(p.retryDeadline('300'), clock.now + 300000);
  assert.equal(p.retryDeadline(new Date(clock.now + 300000).toUTCString()), clock.now + 300000);
  assert.equal(p.retryDeadline('invalid'), clock.now + 60000);
  assert.equal(p.freshTle(NaN), false); assert.equal(p.freshTle(clock.now + 1), false);
});

test('weather 429: no new current-provider request before Retry-After, concurrent reads coalesced', async () => {
  const clock = { now: Date.parse('2026-09-11T14:00:00Z') };
  const policy = load('../app/api/source-policy.ts', {}, clock);
  let currentCalls = 0; let forecastCalls = 0;
  const route = load('../app/api/epaper/v1/weather.ts', {
    '../../source-policy': policy,
    '../../fetch-with-timeout': { fetchWithTimeout: async (url) => {
      if (url.includes('open-meteo')) { currentCalls++; return new Response('{}', { status: 429, headers: { 'Retry-After': '300' } }); }
      forecastCalls++;
      return Response.json({ properties: { meta: { updated_at: new Date(clock.now).toISOString() }, timeseries: Array.from({ length: 30 }, (_, i) => ({ time: new Date(clock.now + i * 3600000).toISOString(), data: { instant: { details: { air_temperature: 20, cloud_area_fraction: 10 } }, next_1_hours: { summary: { symbol_code: 'clearsky_day' } } } })) } });
    } },
  }, clock);
  const [first] = await Promise.all([route.readPantinWeather(), route.readPantinWeather()]);
  assert.equal(first.currentSource, 'met-no'); assert.equal(first.degraded, true);
  assert.equal(currentCalls, 1); assert.equal(forecastCalls, 1);
  clock.now += 180000; await route.readPantinWeather(); assert.equal(currentCalls, 1);
  clock.now += 121000; await route.readPantinWeather(); assert.equal(currentCalls, 2);
});


test('ISS: secondary source restores both tracks after primary timeout, rejects stale secondary data', async () => {
  const clock = { now: Date.parse('2026-09-11T14:00:00Z') };
  const policy = load('../app/api/source-policy.ts', {}, clock);
  const urls = [];
  const route = load('../app/api/iss/route.ts', {
    '../source-policy': policy, '../../access': {}, 'satellite.js': satellite,
    '../fetch-with-timeout': { fetchWithTimeout: async (url, init, timeout) => {
      urls.push(url); assert.equal(timeout, 4000);
      if (url.includes('celestrak')) throw new Error('timeout');
      assert.equal(url, 'https://api.wheretheiss.at/v1/satellites/25544/tles?format=text');
      return new Response('ISS (ZARYA)\n1 25544U 98067A   26254.50000000  .00013495  00000+0  25209-3 0  9997\n2 25544  51.6292 245.3706 0004854 110.6068 249.5441 15.49061543584742');
    } },
  }, clock);
  const [first, second] = await Promise.all([route.readIss(), route.readIss()]);
  assert.equal(urls.length, 2);
  assert.equal(first.status, 'ready'); assert.equal(second.source, 'Where the ISS at');
  assert.equal(first.degraded, true);
  for (const track of [first.pastTrack, first.futureTrack]) {
    assert.equal(track.length, 7);
    assert.ok(track.every(p => Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180));
    assert.notEqual(track[0].longitude, track[6].longitude);
  }
  assert.equal(first.futureTrack[0].latitude, first.latitude);
  assert.equal(first.pastTrack[6].longitude, first.longitude);
  await route.readIss(); assert.equal(urls.length, 2);
  clock.now += 49 * 3600000;
  await assert.rejects(route.readIss(), /périmés/);
  assert.equal(urls.length, 4);
  await assert.rejects(route.readIss()); assert.equal(urls.length, 4);
});
