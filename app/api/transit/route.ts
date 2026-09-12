import { claimTransitRefresh, readTransitRefresh, finishTransitRefresh, type RefreshState } from "./refresh";
import { requireSupervieAccess } from "../../access";
import { fetchWithTimeout } from "../fetch-with-timeout";
import { currentTransit, isFreshTransit } from "./state";

type TransitFavorite = {
  id: string;
  label: string;
  mode: "metro" | "bus";
  lineRef: string;
  stopRefs: string[];
  stop: string;
  direction?: string;
};

type Passage = { time: string; destination: string };

const PRIM_URL = "https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring";
// Owner confirmed a 1,000,000/day quota on 2026-09-12.
// Eight requests/minute = at most 11,520/day; batches still respect 5/s.
const CACHE_MS = 60 * 1000;
const FAILURE_CACHE_MS = 15 * 60 * 1000;

const favorites: TransitFavorite[] = [
  { id: "m5", label: "5", mode: "metro", lineRef: "C01375", stopRefs: ["22014", "463002"], stop: "Raymond Queneau" },
  { id: "145", label: "145", mode: "bus", lineRef: "C01170", stopRefs: ["16934", "37427"], stop: "Raymond Queneau - Métro" },
  { id: "147", label: "147", mode: "bus", lineRef: "C01172", stopRefs: ["16934", "37427"], stop: "Raymond Queneau - Métro" },
  { id: "318", label: "318", mode: "bus", lineRef: "C01281", stopRefs: ["26517", "26520"], stop: "Bretagnes" },
];

type TransitResult = TransitFavorite & { available: boolean; passages: Passage[] };
type TransitSnapshot = { updatedAt: string; lines: TransitResult[]; checkedAt: number };
let cached: { expiresAt: number; updatedAt: string; lines: TransitResult[] } | null = null;
let lastSuccessful: { updatedAt: string; lines: TransitResult[] } | null = null;
let schemaReady: Promise<void> | null = null;
let loading: Promise<Awaited<ReturnType<typeof loadTransit>>> | null = null;
let refreshState: RefreshState | null = null;

class PrimFailure extends Error {
  constructor(readonly status: number, readonly retryAt: number) { super(`PRIM HTTP ${status}`); }
}
function providerDeadline(value: string | null) {
  const seconds = value && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  const date = value ? Date.parse(value) : NaN;
  const deadline = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : date;
  return Number.isFinite(deadline) ? Math.max(Date.now() + FAILURE_CACHE_MS, deadline) : Date.now() + FAILURE_CACHE_MS;
}
function present(snapshot: { updatedAt: string; lines: TransitResult[] }) {
  return { ...currentTransit(snapshot), reason: refreshState?.reason, nextAttemptAt: refreshState?.nextAttemptAt };
}

async function ensureTransitSchema() {
  if (schemaReady) return schemaReady;
  const setup = (async () => {
    const { env } = await import("cloudflare:workers");
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS transit_snapshots (cache_key TEXT PRIMARY KEY, updated_at TEXT NOT NULL, checked_at INTEGER NOT NULL, payload TEXT NOT NULL)").run();
  })();
  schemaReady = setup;
  try {
    await setup;
  } catch (error) {
    schemaReady = null;
    throw error;
  }
}

async function readSnapshot(): Promise<TransitSnapshot | null> {
  await ensureTransitSchema();
  const { env } = await import("cloudflare:workers");
  const row = await env.DB.prepare("SELECT updated_at, checked_at, payload FROM transit_snapshots WHERE cache_key = ?").bind("raymond-queneau").first<{ updated_at: string; checked_at: number; payload: string }>();
  if (!row) return null;
  try {
    const lines = JSON.parse(row.payload) as TransitResult[];
    return Array.isArray(lines) ? { updatedAt: row.updated_at, checkedAt: row.checked_at, lines } : null;
  } catch {
    return null;
  }
}

async function saveSnapshot(updatedAt: string, lines: TransitResult[]) {
  await ensureTransitSchema();
  const { env } = await import("cloudflare:workers");
  await env.DB.prepare("INSERT INTO transit_snapshots (cache_key, updated_at, checked_at, payload) VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET updated_at = excluded.updated_at, checked_at = excluded.checked_at, payload = excluded.payload")
    .bind("raymond-queneau", updatedAt, Date.now(), JSON.stringify(lines)).run();
}

function textValue(value: unknown) {
  return Array.isArray(value) && typeof value[0]?.value === "string" ? value[0].value : "";
}

async function readStop(stopRef: string, favorite: TransitFavorite, apiKey: string): Promise<Passage[]> {
  const url = new URL(PRIM_URL);
  url.searchParams.set("MonitoringRef", `STIF:StopPoint:Q:${stopRef}:`);
  url.searchParams.set("LineRef", `STIF:Line::${favorite.lineRef}:`);
  // PRIM documents MonitoringRef and optional LineRef only. Limit results
  // locally in readLine rather than sending the unsupported SIRI parameter.
  const response = await fetchWithTimeout(url, {
    headers: { Accept: "application/json", apikey: apiKey },
    cf: { cacheEverything: true, cacheTtl: 60 },
  } as RequestInit, 4_000);
  if (!response.ok) throw new PrimFailure(response.status, providerDeadline(response.headers.get("retry-after")));

  const data = await response.json() as {
    Siri?: { ServiceDelivery?: { StopMonitoringDelivery?: Array<{ MonitoredStopVisit?: Array<Record<string, unknown>> }> } };
  };
  const visits = data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ?? [];
  return visits.flatMap((visit) => {
    const journey = visit.MonitoredVehicleJourney as Record<string, unknown> | undefined;
    if (!journey) return [];
    const destination = textValue(journey.DestinationName) || textValue(journey.DirectionName);
    if (favorite.direction && !destination.toLocaleLowerCase("fr").includes(favorite.direction.toLocaleLowerCase("fr"))) return [];
    const call = journey.MonitoredCall as Record<string, unknown> | undefined;
    const time = typeof call?.ExpectedDepartureTime === "string"
      ? call.ExpectedDepartureTime
      : typeof call?.ExpectedArrivalTime === "string"
        ? call.ExpectedArrivalTime
        : "";
    return time ? [{ time, destination }] : [];
  });
}

async function readLine(favorite: TransitFavorite, apiKey: string, failures: PrimFailure[]): Promise<TransitResult> {
  try {
    const results = await Promise.allSettled(favorite.stopRefs.map((stopRef) => readStop(stopRef, favorite, apiKey)));
    const candidates = results.flatMap((result) => {
      if (result.status === "fulfilled") return result.value;
      const failure = result.reason instanceof PrimFailure ? result.reason : new PrimFailure(0, Date.now() + FAILURE_CACHE_MS);
      failures.push(failure);
      console.error(`Transit ${favorite.label} unavailable: ${failure.message}`);
      return [];
    });
    const passageCountsByDestination = new Map<string, number>();
    const passages = candidates.filter((passage) => Number.isFinite(Date.parse(passage.time)) && Date.parse(passage.time) >= Date.now() - 60_000)
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
      .filter((passage, index, all) => index === 0 || passage.time !== all[index - 1].time || passage.destination !== all[index - 1].destination)
      // Keep room for both travel directions when one direction has frequent vehicles.
      .filter((passage) => {
        const count = passageCountsByDestination.get(passage.destination) ?? 0;
        passageCountsByDestination.set(passage.destination, count + 1);
        return count < 3;
      })
      .slice(0, 8);
    return { ...favorite, available: passages.length > 0, passages };
  } catch (error) {
    console.error(`Transit ${favorite.label} unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return { ...favorite, available: false, passages: [] };
  }
}

async function loadTransit() {
  if (cached && cached.expiresAt > Date.now()) return present(cached);
  const snapshot = await readSnapshot();
  refreshState = await readTransitRefresh();
  const freshSnapshot = snapshot && isFreshTransit(snapshot.updatedAt) ? snapshot : null;
  if (freshSnapshot && freshSnapshot.checkedAt + CACHE_MS > Date.now()) {
    cached = { expiresAt: freshSnapshot.checkedAt + CACHE_MS, updatedAt: freshSnapshot.updatedAt, lines: freshSnapshot.lines };
    return present(freshSnapshot);
  }
  const { env } = await import("cloudflare:workers");
  const apiKey = typeof env.IDFM_PRIM_API_KEY === "string" ? env.IDFM_PRIM_API_KEY : "";
  if (!apiKey) return freshSnapshot
    ? currentTransit(freshSnapshot)
    : currentTransit({ updatedAt: snapshot?.updatedAt ?? "", lines: favorites.map((line) => ({ ...line, available: false, passages: [] })) });
  const reservation = await claimTransitRefresh(Date.now(), CACHE_MS);
  if (reservation === null) {
    refreshState = await readTransitRefresh();
    // Another instance may have completed while this one was claiming the gate.
    const latest = await readSnapshot();
    return present(latest ?? { updatedAt: "", lines: favorites.map(line => ({ ...line, available: false, passages: [] })) });
  }
  const failures: PrimFailure[] = [];
  // Four requests per group, separated by more than one second (PRIM: 5/s).
  const first = await Promise.all(favorites.slice(0, 2).map(line => readLine(line, apiKey, failures)));
  await new Promise(resolve => setTimeout(resolve, 1_100));
  const second = await Promise.all(favorites.slice(2).map(line => readLine(line, apiKey, failures)));
  const lines = [...first, ...second];
  const limited = failures.filter(failure => failure.status === 429);
  refreshState = {
    reason: limited.length ? "rate_limited" : failures.length ? "source_error" : lines.some(line => line.available) ? "ready" : "no_departures",
    nextAttemptAt: limited.length ? Math.max(...limited.map(failure => failure.retryAt)) : Date.now() + (failures.length ? FAILURE_CACHE_MS : CACHE_MS),
  };
  const updatedAt = new Date().toISOString();
  if (lines.some((line) => line.available)) {
    lastSuccessful = { updatedAt, lines };
    await saveSnapshot(updatedAt, lines);
    cached = { expiresAt: Date.now() + CACHE_MS, updatedAt, lines };
  } else if (freshSnapshot) {
    // Do not write a failed read back: that would refresh checked_at forever.
    cached = { expiresAt: Date.now() + FAILURE_CACHE_MS, updatedAt: freshSnapshot.updatedAt, lines: freshSnapshot.lines };
  } else if (lastSuccessful && isFreshTransit(lastSuccessful.updatedAt)) {
    cached = { expiresAt: Date.now() + FAILURE_CACHE_MS, ...lastSuccessful };
  } else {
    cached = { expiresAt: Date.now() + FAILURE_CACHE_MS, updatedAt: snapshot?.updatedAt ?? "", lines };
  }
  cached.expiresAt = refreshState.nextAttemptAt;
  await finishTransitRefresh(reservation, refreshState);
  return present(cached);
}

export async function readTransit() {
  if (!loading) loading = loadTransit().finally(() => { loading = null; });
  return loading;
}

export async function GET(request: Request) {
  const denied = await requireSupervieAccess(request);
  if (denied) return denied;
  return Response.json(await readTransit(), { headers: { "Cache-Control": "no-store" } });
}
