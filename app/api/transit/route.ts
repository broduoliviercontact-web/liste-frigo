import { requireSupervieAccess } from "../../access";

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

const PRIM_URL = "https://prim.iledefrance-mobilites.fr/marketplace/requete-ligne";
const CACHE_MS = 10 * 60 * 1000;

const favorites: TransitFavorite[] = [
  { id: "m5", label: "5", mode: "metro", lineRef: "C01375", stopRefs: ["22014", "463002"], stop: "Raymond Queneau" },
  { id: "145", label: "145", mode: "bus", lineRef: "C01170", stopRefs: ["22337", "491921"], stop: "Église de Pantin - Métro" },
  { id: "147", label: "147", mode: "bus", lineRef: "C01172", stopRefs: ["22337", "30119"], stop: "Église de Pantin - Métro" },
  { id: "245", label: "245", mode: "bus", lineRef: "C02713", stopRefs: ["22337"], stop: "Église de Pantin - Métro" },
  { id: "318", label: "318", mode: "bus", lineRef: "C01281", stopRefs: ["25960", "37676"], stop: "Pantin - Raymond Queneau" },
  { id: "330", label: "330", mode: "bus", lineRef: "C01289", stopRefs: ["492451", "22568"], stop: "Hoche - Métro" },
];

type TransitResult = TransitFavorite & { available: boolean; passages: Passage[] };
let cached: { expiresAt: number; updatedAt: string; lines: TransitResult[] } | null = null;

function textValue(value: unknown) {
  return Array.isArray(value) && typeof value[0]?.value === "string" ? value[0].value : "";
}

async function readLine(favorite: TransitFavorite, apiKey: string): Promise<TransitResult> {
  try {
    const url = new URL(PRIM_URL);
    url.searchParams.set("LineRef", `STIF:Line::${favorite.lineRef}:`);
    const response = await fetch(url, {
      headers: { Accept: "application/json", apikey: apiKey },
      cf: { cacheEverything: true, cacheTtl: 600 },
    } as RequestInit);
    if (!response.ok) throw new Error(`PRIM HTTP ${response.status}`);
    const data = await response.json() as {
      Siri?: { ServiceDelivery?: { EstimatedTimetableDelivery?: Array<{ EstimatedJourneyVersionFrame?: Array<{ EstimatedVehicleJourney?: Array<Record<string, unknown>> }> }> } };
    };
    const journeys = data.Siri?.ServiceDelivery?.EstimatedTimetableDelivery?.[0]?.EstimatedJourneyVersionFrame?.[0]?.EstimatedVehicleJourney ?? [];
    const wantedStops = new Set(favorite.stopRefs.map((stopRef) => `STIF:StopPoint:Q:${stopRef}:`));
    const passageCountsByDestination = new Map<string, number>();
    const passages = journeys.flatMap((journey) => {
      const destination = textValue(journey.DestinationName) || textValue(journey.DirectionName);
      if (favorite.direction && !destination.toLocaleLowerCase("fr").includes(favorite.direction.toLocaleLowerCase("fr"))) return [];
      const calls = (journey.EstimatedCalls as { EstimatedCall?: Array<Record<string, unknown>> } | undefined)?.EstimatedCall ?? [];
      return calls.flatMap((call) => {
        const ref = (call.StopPointRef as { value?: string } | undefined)?.value;
        const time = typeof call.ExpectedDepartureTime === "string" ? call.ExpectedDepartureTime : typeof call.ExpectedArrivalTime === "string" ? call.ExpectedArrivalTime : "";
        return wantedStops.has(ref ?? "") && time ? [{ time, destination }] : [];
      });
    }).filter((passage) => Date.parse(passage.time) >= Date.now() - 60_000)
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

export async function readTransit() {
  if (cached && cached.expiresAt > Date.now()) return { updatedAt: cached.updatedAt, lines: cached.lines };
  const { env } = await import("cloudflare:workers");
  const apiKey = typeof env.IDFM_PRIM_API_KEY === "string" ? env.IDFM_PRIM_API_KEY : "";
  if (!apiKey) return { updatedAt: new Date().toISOString(), lines: favorites.map((line) => ({ ...line, available: false, passages: [] })) };
  const lines = await Promise.all(favorites.map((line) => readLine(line, apiKey)));
  cached = { expiresAt: Date.now() + CACHE_MS, updatedAt: new Date().toISOString(), lines };
  return { updatedAt: cached.updatedAt, lines };
}

export async function GET(request: Request) {
  const denied = await requireSupervieAccess(request);
  if (denied) return denied;
  return Response.json(await readTransit());
}
