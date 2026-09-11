export const BOATS_AREA = {
  // Canal de l'Ourcq autour du metro Raymond-Queneau, entre Pantin et Bobigny.
  minLat: 48.889,
  maxLat: 48.901,
  minLon: 2.4,
  maxLon: 2.445,
} as const;

export const HOME_CANAL_POINT = {
  // Passage du canal le plus proche de Raymond-Queneau.
  lat: 48.8936,
  lon: 2.4248,
} as const;

export const STALE_POSITION_MS = 15 * 60 * 1000;
const AISSTREAM_URL = "https://stream.aisstream.io/v0/stream";
const MIN_MOVING_SPEED_KNOTS = 0.5;
const MAX_RESULTS = 8;
const COLLECTION_WINDOW_MS = 18_000;
const FRESH_CONNECTION_MS = 60_000;

export type BoatDirection = "PARIS" | "BOBIGNY" | "INDETERMINE";

export type NormalizedBoat = {
  id: string;
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  speedKnots: number | null;
  heading: number | null;
  vesselType: string | null;
  updatedAt: string;
};

export type BoatSummary = {
  id: string;
  name: string;
  mmsi: string;
  distanceKm: number;
  speedKmh: number;
  heading: number | null;
  direction: BoatDirection;
  etaMinutes: number | null;
  vesselType: string;
  progressPercent: number;
  updatedAt: string;
};

export const BOATS_ROUTE = {
  name: "Canal de l'Ourcq",
  from: "Pantin",
  home: "Raymond-Queneau",
  to: "Bobigny",
  lengthKm: Number(distanceKm(
    { lat: HOME_CANAL_POINT.lat, lon: BOATS_AREA.minLon },
    { lat: HOME_CANAL_POINT.lat, lon: BOATS_AREA.maxLon },
  ).toFixed(1)),
  homeProgressPercent: Math.round((HOME_CANAL_POINT.lon - BOATS_AREA.minLon) / (BOATS_AREA.maxLon - BOATS_AREA.minLon) * 100),
} as const;

type Point = { lat: number; lon: number };
type AisEnvelope = {
  MessageType?: unknown;
  MetaData?: Record<string, unknown>;
  Message?: Record<string, Record<string, unknown> | undefined>;
};

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanHeading(value: unknown): number | null {
  const heading = finiteNumber(value);
  return heading !== null && heading >= 0 && heading < 360 ? heading : null;
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 40) : "";
}

export function knotsToKmh(knots: number) {
  return knots * 1.852;
}

export function distanceKm(a: Point, b: Point) {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const latA = a.lat * radians;
  const latB = b.lat * radians;
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

function bearingDegrees(from: Point, to: Point) {
  const radians = Math.PI / 180;
  const fromLat = from.lat * radians;
  const toLat = to.lat * radians;
  const dLon = (to.lon - from.lon) * radians;
  const y = Math.sin(dLon) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLon);
  return (Math.atan2(y, x) / radians + 360) % 360;
}

function angleDifference(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function directionFor(heading: number | null, speedKnots: number | null): BoatDirection {
  if (heading === null || speedKnots === null || speedKnots < MIN_MOVING_SPEED_KNOTS) return "INDETERMINE";
  // The canal axis is approximately 75°/255° here.
  if (angleDifference(heading, 255) <= 70) return "PARIS";
  if (angleDifference(heading, 75) <= 70) return "BOBIGNY";
  return "INDETERMINE";
}

export function calculateEtaMinutes(boat: Pick<NormalizedBoat, "lat" | "lon" | "speedKnots" | "heading">, home = HOME_CANAL_POINT) {
  if (boat.speedKnots === null || boat.speedKnots < MIN_MOVING_SPEED_KNOTS || boat.heading === null) return null;
  const bearingToHome = bearingDegrees(boat, home);
  if (angleDifference(boat.heading, bearingToHome) > 70) return null;
  const speedKmh = knotsToKmh(boat.speedKnots);
  const minutes = distanceKm(boat, home) / speedKmh * 60;
  return Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : null;
}

function positionPayload(envelope: AisEnvelope) {
  const type = typeof envelope.MessageType === "string" ? envelope.MessageType : "";
  if (!["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport"].includes(type)) return null;
  return envelope.Message?.[type] ?? null;
}

export function normalizeAisMessage(value: unknown, now = new Date()): NormalizedBoat | null {
  if (!value || typeof value !== "object") return null;
  const envelope = value as AisEnvelope;
  const payload = positionPayload(envelope);
  if (!payload) return null;
  const metadata = envelope.MetaData ?? {};
  const lat = finiteNumber(metadata.Latitude ?? payload.Latitude);
  const lon = finiteNumber(metadata.Longitude ?? payload.Longitude);
  const mmsiNumber = finiteNumber(metadata.MMSI ?? payload.UserID);
  if (lat === null || lon === null || mmsiNumber === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const speedKnots = finiteNumber(payload.Sog);
  const heading = cleanHeading(payload.TrueHeading) ?? cleanHeading(payload.Cog);
  const mmsi = String(Math.trunc(mmsiNumber));
  const vesselTypeValue = metadata.ShipType ?? payload.Type ?? payload.TypeAndCargo;
  const vesselType = vesselTypeValue === undefined ? null : String(vesselTypeValue);
  return {
    id: mmsi,
    mmsi,
    name: cleanName(metadata.ShipName) || `Bateau ${mmsi}`,
    lat,
    lon,
    speedKnots: speedKnots !== null && speedKnots >= 0 && speedKnots < 103 ? speedKnots : null,
    heading,
    vesselType,
    updatedAt: now.toISOString(),
  };
}

export function pruneStaleBoats(boats: Map<string, NormalizedBoat>, now = Date.now(), maxAgeMs = STALE_POSITION_MS) {
  for (const [id, boat] of boats) {
    if (!Number.isFinite(Date.parse(boat.updatedAt)) || Date.parse(boat.updatedAt) < now - maxAgeMs) boats.delete(id);
  }
  return boats;
}

function summarizeBoat(boat: NormalizedBoat): BoatSummary {
  return {
    id: boat.id,
    name: boat.name,
    mmsi: boat.mmsi,
    distanceKm: Number(distanceKm(boat, HOME_CANAL_POINT).toFixed(1)),
    speedKmh: Number(knotsToKmh(boat.speedKnots ?? 0).toFixed(1)),
    heading: boat.heading,
    direction: directionFor(boat.heading, boat.speedKnots),
    etaMinutes: calculateEtaMinutes(boat),
    vesselType: vesselTypeLabel(boat.vesselType),
    progressPercent: Math.round(Math.min(100, Math.max(0, (boat.lon - BOATS_AREA.minLon) / (BOATS_AREA.maxLon - BOATS_AREA.minLon) * 100))),
    updatedAt: boat.updatedAt,
  };
}

export function vesselTypeLabel(value: string | null) {
  if (!value) return "Bateau AIS";
  const code = Number(value);
  if (!Number.isFinite(code)) return cleanName(value) || "Bateau AIS";
  if (code === 30) return "Pêche";
  if (code === 31 || code === 32) return "Convoi remorqué";
  if (code === 33) return "Dragage / travaux";
  if (code === 36) return "Voilier";
  if (code === 37) return "Plaisance";
  if (code === 52) return "Remorqueur";
  if (code >= 60 && code <= 69) return "Passagers";
  if (code >= 70 && code <= 79) return "Marchandises / péniche";
  if (code >= 80 && code <= 89) return "Citerne";
  return `Bateau AIS · type ${Math.trunc(code)}`;
}

const MOCK_BOATS: BoatSummary[] = [
  { id: "mock-peniche", name: "PENICHE TEST", mmsi: "000000001", distanceKm: 1.2, speedKmh: 6, heading: 255, direction: "PARIS", etaMinutes: 12, vesselType: "Marchandises / péniche", progressPercent: 82, updatedAt: "" },
  { id: "mock-ourcq", name: "OURCQ 02", mmsi: "000000002", distanceKm: 2.4, speedKmh: 5, heading: 75, direction: "BOBIGNY", etaMinutes: 25, vesselType: "Remorqueur", progressPercent: 18, updatedAt: "" },
];

class AisService {
  private boats = new Map<string, NormalizedBoat>();
  private collection: Promise<void> | null = null;
  private reconnectAttempt = 0;
  private apiKey = "";
  private lastSuccessfulFrameAt = 0;
  private retryAfter = 0;
  private lastLogAt = 0;

  refresh(apiKey: string, keepAlive: (promise: Promise<unknown>) => void) {
    if (!apiKey || Date.now() < this.retryAfter) return;
    if (this.apiKey && this.apiKey !== apiKey) {
      this.reconnectAttempt = 0;
      this.retryAfter = 0;
      this.lastSuccessfulFrameAt = 0;
    }
    this.apiKey = apiKey;
    if (!this.collection) {
      this.collection = this.collect().finally(() => { this.collection = null; });
      keepAlive(this.collection);
    }
  }

  snapshot(useMock: boolean) {
    const updatedAt = new Date().toISOString();
    if (useMock) return { status: "ok" as const, updatedAt, route: BOATS_ROUTE, boats: MOCK_BOATS.map((boat) => ({ ...boat, updatedAt })) };
    pruneStaleBoats(this.boats);
    const boats = [...this.boats.values()].map(summarizeBoat)
      .sort((a, b) => (a.etaMinutes ?? Number.MAX_SAFE_INTEGER) - (b.etaMinutes ?? Number.MAX_SAFE_INTEGER) || a.distanceKm - b.distanceKm)
      .slice(0, MAX_RESULTS);
    const recentlyConnected = Date.now() - this.lastSuccessfulFrameAt <= FRESH_CONNECTION_MS;
    return { status: recentlyConnected ? "ok" as const : "degraded" as const, updatedAt, route: BOATS_ROUTE, boats };
  }

  private async collect() {
    const handshake = new AbortController();
    const handshakeTimer = setTimeout(() => handshake.abort(), 8_000);
    try {
      const response = await fetch(AISSTREAM_URL, {
        headers: { Upgrade: "websocket" },
        signal: handshake.signal,
      });
      clearTimeout(handshakeTimer);
      const socket = (response as Response & { webSocket?: WebSocket & { accept(): void } }).webSocket;
      if (!socket) throw new Error(`handshake HTTP ${response.status}`);
      socket.accept();

      await new Promise<void>((resolve) => {
        let finished = false;
        let receivedFrame = false;
        const finish = (failed: boolean) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          if (failed && !receivedFrame) this.scheduleRetry();
          else if (receivedFrame) {
            this.reconnectAttempt = 0;
            this.retryAfter = 0;
          }
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close(1000, "collecte terminee");
          }
          resolve();
        };
        const timer = setTimeout(() => finish(!receivedFrame), COLLECTION_WINDOW_MS);

        socket.addEventListener("message", (event) => {
          void this.consumeFrame(event.data).then((accepted) => {
            if (!accepted) return;
            receivedFrame = true;
            this.lastSuccessfulFrameAt = Date.now();
          });
        });
        socket.addEventListener("close", () => finish(!receivedFrame));
        socket.addEventListener("error", () => {
          this.logError("connexion AISStream interrompue");
          finish(true);
        });
        socket.send(JSON.stringify({
          APIKey: this.apiKey,
          BoundingBoxes: [[[BOATS_AREA.minLat, BOATS_AREA.minLon], [BOATS_AREA.maxLat, BOATS_AREA.maxLon]]],
          FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport"],
        }));
      });
    } catch (error) {
      clearTimeout(handshakeTimer);
      this.logError(`connexion AISStream impossible: ${error instanceof Error ? error.message : String(error)}`);
      this.scheduleRetry();
    }
  }

  private async consumeFrame(data: unknown) {
    try {
      let text: string;
      if (typeof data === "string") text = data;
      else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
      else if (typeof Blob !== "undefined" && data instanceof Blob) text = await data.text();
      else return false;
      const parsed = JSON.parse(text);
      const boat = normalizeAisMessage(parsed);
      if (boat) {
        const previous = this.boats.get(boat.id);
        this.boats.set(boat.id, {
          ...boat,
          name: boat.name.startsWith("Bateau ") && previous?.name ? previous.name : boat.name,
          vesselType: boat.vesselType ?? previous?.vesselType ?? null,
        });
        pruneStaleBoats(this.boats);
      }
      return boat !== null || (parsed && typeof parsed === "object" && parsed.MessageType === "SubscriptionConfirmation");
    } catch (error) {
      this.logError(`message AIS ignore: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private scheduleRetry() {
    const delay = Math.min(60_000, 1_000 * 2 ** Math.min(this.reconnectAttempt++, 6));
    this.retryAfter = Date.now() + delay;
  }

  private logError(message: string) {
    const now = Date.now();
    if (now - this.lastLogAt < 30_000) return;
    this.lastLogAt = now;
    console.error(`Bateaux: ${message}`);
  }
}

const aisService = new AisService();

export async function readBoats() {
  const workers = await import("cloudflare:workers");
  const runtime = workers.env as unknown as Record<string, unknown>;
  const useMock = String(runtime.BOATS_USE_MOCK ?? process.env.BOATS_USE_MOCK ?? "").toLowerCase() === "true";
  const apiKey = typeof runtime.AISSTREAM_API_KEY === "string" ? runtime.AISSTREAM_API_KEY : process.env.AISSTREAM_API_KEY ?? "";
  // Miniflare's Vite runner cannot reliably proxy this external WebSocket and
  // can stall unrelated local routes. Production Workers support the client.
  if (!useMock && !import.meta.env.DEV) aisService.refresh(apiKey, workers.waitUntil);
  return aisService.snapshot(useMock);
}
