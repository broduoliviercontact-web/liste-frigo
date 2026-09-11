import { freshTle, tleEpoch } from "../source-policy";
import { requireSupervieAccess } from "../../access";
import { fetchWithTimeout } from "../fetch-with-timeout";
import { degreesLat, degreesLong, eciToGeodetic, gstime, propagate, twoline2satrec } from "satellite.js";

const TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE";
const TLE_CACHE_MS = 6 * 60 * 60 * 1000;
let tleCache: { lines: readonly [string, string]; expiresAt: number } | null = null;
let retryAt = 0;
let loading: Promise<readonly [string, string]> | null = null;

function describePosition(latitude: number, longitude: number) {
  if (latitude < -60) return "Région antarctique";
  if (latitude > 66) return "Région arctique";
  if (latitude > 35 && longitude >= -10 && longitude <= 45) return "Europe";
  if (latitude > 5 && longitude > 20 && longitude < 150) return "Asie";
  if (latitude > -35 && longitude >= -20 && longitude <= 55) return "Afrique";
  if (longitude >= -70 && longitude <= 20) {
    if (latitude >= 0) return "Océan Atlantique Nord";
    return "Océan Atlantique Sud";
  }
  if (longitude > 20 && longitude < 115 && latitude < 25) return "Océan Indien";
  if (longitude >= 115 || longitude < -70) {
    if (latitude >= 0) return "Océan Pacifique Nord";
    return "Océan Pacifique Sud";
  }
  return "Au-dessus de la Terre";
}

async function fetchTle() {
  if (tleCache && freshTle(tleEpoch(tleCache.lines[0])) && tleCache.expiresAt > Date.now()) return tleCache.lines;
  if (Date.now() < retryAt) {
    if (tleCache && freshTle(tleEpoch(tleCache.lines[0]))) return tleCache.lines;
    throw new Error("Éléments orbitaux ISS indisponibles ou périmés");
  }
  try {
    const response = await fetchWithTimeout(TLE_URL, {
      headers: { Accept: "text/plain" },
      cf: { cacheEverything: true, cacheTtl: 21_600 },
    } as RequestInit);
    if (!response.ok) throw new Error(`CelesTrak HTTP ${response.status}`);
    const lines = (await response.text()).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const line1 = lines.find((line) => line.startsWith("1 25544"));
    const line2 = lines.find((line) => line.startsWith("2 25544"));
    if (!line1 || !line2) throw new Error("TLE ISS incomplet");
    if (!freshTle(tleEpoch(line1))) throw new Error("Éléments orbitaux ISS périmés");
    const tle = [line1, line2] as const;
    tleCache = { lines: tle, expiresAt: Date.now() + TLE_CACHE_MS };
    return tle;
  } catch (error) {
    console.error(`ISS TLE unavailable: ${error instanceof Error ? error.message : String(error)}`);
    retryAt = Date.now() + 60_000;
    if (tleCache && freshTle(tleEpoch(tleCache.lines[0]))) return tleCache.lines;
    throw new Error("Éléments orbitaux ISS indisponibles ou périmés");
  }
}

async function readTle() {
  if (!loading) loading = fetchTle().finally(() => { loading = null; });
  return loading;
}

function positionAt(line1: string, line2: string, date: Date) {
  const satellite = twoline2satrec(line1, line2);
  const propagated = propagate(satellite, date);
  const position = propagated?.position;
  const velocityVector = propagated?.velocity;
  if (!position || !velocityVector) throw new Error("Calcul orbital ISS impossible");
  const geodetic = eciToGeodetic(position, gstime(date));
  const velocity = Math.hypot(velocityVector.x, velocityVector.y, velocityVector.z) * 3600;
  return {
    latitude: degreesLat(geodetic.latitude),
    longitude: degreesLong(geodetic.longitude),
    altitude: geodetic.height,
    velocity,
  };
}

export async function readIss() {
  const [line1, line2] = await readTle();
  const now = new Date();
  const futurePositions = Array.from({ length: 7 }, (_, index) => positionAt(line1, line2, new Date(now.getTime() + index * 6 * 60_000)));
  const pastPositions = Array.from({ length: 7 }, (_, index) => positionAt(line1, line2, new Date(now.getTime() - (6 - index) * 6 * 60_000)));
  const current = futurePositions[0];

  return {
    status: "ready" as const,
    updatedAt: now.toISOString(),
    sourceUpdatedAt: new Date(tleEpoch(line1)).toISOString(),
    sourceAgeSeconds: Math.round((now.getTime() - tleEpoch(line1)) / 1000),
    degraded: Date.now() < retryAt,
    speedKmh: Math.round(current.velocity),
    over: describePosition(current.latitude, current.longitude),
    latitude: current.latitude,
    longitude: current.longitude,
    altitudeKm: Math.round(current.altitude),
    track: futurePositions.map((position) => ({ latitude: position.latitude, longitude: position.longitude })),
    pastTrack: pastPositions.map((position) => ({ latitude: position.latitude, longitude: position.longitude })),
    futureTrack: futurePositions.map((position) => ({ latitude: position.latitude, longitude: position.longitude })),
  };
}

export async function GET(request: Request) {
  const denied = await requireSupervieAccess(request);
  if (denied) return denied;
  try {
    return Response.json(await readIss(), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return Response.json(
      { status: "unavailable", error: error instanceof Error ? error.message : "ISS indisponible" },
      { status: 503 },
    );
  }
}
