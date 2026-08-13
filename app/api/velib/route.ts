const INFO_URL = "https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_information.json";
const STATUS_URL = "https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json";
const FALLBACK_INFO_URL = "https://api.citybik.es/gbfs/2/velib/station_information.json";
const FALLBACK_STATUS_URL = "https://api.citybik.es/gbfs/2/velib/station_status.json";

// 11 avenue du Colonel Fabien, Pantin — point de départ utilisé pour le classement.
const HOME = { lat: 48.8932, lon: 2.4222 };

type StationInfo = { station_id: string; name: string; lat: number; lon: number };
type BikeType = Record<string, number>;
type StationStatus = {
  station_id: string;
  num_bikes_available?: number;
  num_docks_available?: number;
  num_bikes_available_types?: BikeType[];
  vehicle_types_available?: Array<{ vehicle_type_id?: string; count?: number }>;
  is_renting?: number;
  is_installed?: number;
};

function distanceMetres(a: typeof HOME, b: { lat: number; lon: number }) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function bikeCounts(status: StationStatus) {
  let electric = 0;
  let mechanical = 0;
  for (const entry of status.num_bikes_available_types ?? []) {
    electric += Number(entry.ebike ?? entry.electric ?? 0);
    mechanical += Number(entry.mechanical ?? entry.classic ?? 0);
  }
  for (const entry of status.vehicle_types_available ?? []) {
    const type = entry.vehicle_type_id?.toLowerCase() ?? "";
    if (type.includes("electric") || type.includes("ebike")) electric += Number(entry.count ?? 0);
    else if (type.includes("mechanical") || type.includes("classic")) mechanical += Number(entry.count ?? 0);
  }
  if (electric + mechanical === 0) mechanical = Number(status.num_bikes_available ?? 0);
  return { electric, mechanical };
}

export async function GET() {
  try {
    let informationResponse: Response | null = null;
    let statusResponse: Response | null = null;
    for (const [informationUrl, statusUrl] of [[INFO_URL, STATUS_URL], [FALLBACK_INFO_URL, FALLBACK_STATUS_URL]]) {
      const responses = await Promise.all([
        fetch(informationUrl, { headers: { Accept: "application/json" }, cf: { cacheTtl: 300 } } as RequestInit),
        fetch(statusUrl, { headers: { Accept: "application/json" }, cf: { cacheTtl: 20 } } as RequestInit),
      ]).catch(() => [null, null] as const);
      if (responses[0]?.ok && responses[1]?.ok) { informationResponse = responses[0]; statusResponse = responses[1]; break; }
    }
    if (!informationResponse || !statusResponse) throw new Error("Données Vélib indisponibles");

    const information = await informationResponse.json() as { data?: { stations?: StationInfo[] } };
    const statuses = await statusResponse.json() as { data?: { stations?: StationStatus[] }; last_updated?: number };
    const statusById = new Map((statuses.data?.stations ?? []).map((station) => [String(station.station_id), station]));

    const stations = (information.data?.stations ?? [])
      .map((station) => {
        const status = statusById.get(String(station.station_id));
        if (!status || status.is_installed === 0 || status.is_renting === 0) return null;
        const counts = bikeCounts(status);
        return {
          id: String(station.station_id), name: station.name,
          distance: distanceMetres(HOME, station),
          electric: counts.electric, mechanical: counts.mechanical,
          docks: Number(status.num_docks_available ?? 0),
        };
      })
      .filter((station): station is NonNullable<typeof station> => Boolean(station))
      .filter((station) => station.distance <= 1800)
      .sort((a, b) => Number(b.electric > 0) - Number(a.electric > 0) || a.distance - b.distance)
      .slice(0, 5);

    return Response.json({ stations, updatedAt: (statuses.last_updated ?? Math.floor(Date.now() / 1000)) * 1000 }, { headers: { "Cache-Control": "public, max-age=15" } });
  } catch (error) {
    return Response.json({ stations: [], error: error instanceof Error ? error.message : "Erreur Vélib" }, { status: 502 });
  }
}
