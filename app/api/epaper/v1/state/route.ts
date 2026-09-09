import { readAll } from "../../../lists/route";
import { readWeekMeals } from "../../../meals/route";
import { readPantinWeather } from "../weather";
import { readTransit } from "../../../transit/route";
import { requireSupervieAccess } from "../../../../access";
import { readIss } from "../../../iss/route";

export async function GET(request: Request) {
  try {
    const denied = await requireSupervieAccess(request);
    if (denied) return denied;
    const [lists, weather, meals, transit, iss] = await Promise.all([
      readAll(),
      readPantinWeather(),
      readWeekMeals(),
      readTransit(),
      readIss().catch(() => ({
        status: "unavailable" as const,
        updatedAt: new Date().toISOString(),
        speedKmh: 27598,
        over: "ISS indisponible",
        latitude: null,
        longitude: null,
      })),
    ]);
    const requestedId = Number(new URL(request.url).searchParams.get("listId"));
    const selectedIndex = lists.findIndex((list) => list.id === requestedId);
    const selectedList = lists[selectedIndex >= 0 ? selectedIndex : 0];
    const orderedLists = selectedList
      ? [selectedList, ...lists.filter((list) => list.id !== selectedList.id)]
      : lists;

    return Response.json({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      display: { logicalWidth: 540, logicalHeight: 960, orientation: "portrait" },
      activeTab: "listes",
      epaperSettings: {
        visibleTabs: ["listes", "creche", "meteo", "repas", "metro", "iss", "air"],
        activeTab: "listes",
        preferredTab: "listes",
        carousel: { enabled: false, intervalSeconds: 120 },
      },
      selectedListId: selectedList?.id ?? null,
      pages: {
        listes: {
          status: "ready",
          lists: orderedLists,
        },
        meteo: weather,
        repas: { status: "ready", ...meals },
        metro: {
          status: "ready",
          updatedAt: transit.updatedAt,
          lines: transit.lines.map((line) => {
            const directions = Object.values(line.passages.reduce<Record<string, { destination: string; minutes: number[] }>>((groups, passage) => {
              const departureAt = Date.parse(passage.time);
              if (!Number.isFinite(departureAt)) return groups;
              const destination = passage.destination || line.direction || line.stop;
              const group = groups[destination] ?? { destination, minutes: [] };
              group.minutes.push(Math.max(0, Math.round((departureAt - Date.now()) / 60_000)));
              groups[destination] = group;
              return groups;
            }, {})).filter((direction) => direction.minutes.length > 0)
              .sort((a, b) => (a.minutes[0] ?? 999) - (b.minutes[0] ?? 999)).slice(0, 2);
            return {
              label: line.label,
              mode: line.mode,
              stop: line.stop,
              available: line.available && directions.length > 0,
              directions,
            };
          }),
        },
        iss: {
          status: iss.status,
          updatedAt: iss.updatedAt,
          speedKmh: iss.speedKmh,
          over: iss.over,
          latitude: iss.latitude,
          longitude: iss.longitude,
          altitudeKm: iss.altitudeKm,
          visibility: iss.visibility,
          home: { label: "Nous", latitude: 48.895, longitude: 2.409 },
          track: iss.track ?? [],
        },
        air: {
          status: "ready",
          radiusKm: 25,
          home: { label: "Nous", latitude: 48.895, longitude: 2.409 },
          scan: { refreshSeconds: 10, mode: "mock" },
          aircraft: [
            { registration: "AFR76P", x: 146, y: 84, heading: 45, altitudeM: 11300, speedKmh: 812, past: [[48, 52], [53, 48], [58, 44]], future: [[62, 40], [67, 35], [72, 30]] },
            { registration: "RYR32HA", x: 96, y: 130, heading: 95, altitudeM: 7900, speedKmh: 692, past: [[43, 56], [45, 56], [47, 56]], future: [[51, 56], [56, 57], [62, 59]] },
            { registration: "EJU49KT", x: 176, y: 164, heading: 210, altitudeM: 5200, speedKmh: 468, past: [[77, 52], [73, 56], [69, 59]], future: [[63, 64], [58, 69], [52, 74]] },
            { registration: "TVF1QD", x: 62, y: 190, heading: 310, altitudeM: 9600, speedKmh: 744, past: [[33, 76], [36, 72], [38, 70]], future: [[42, 66], [46, 62], [51, 57]] },
            { registration: "BAW8SG", x: 210, y: 106, heading: 130, altitudeM: 10800, speedKmh: 785, past: [[64, 39], [68, 42], [71, 44]], future: [[75, 49], [80, 54], [85, 60]] },
          ],
        },
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Erreur base de données" },
      { status: 500 },
    );
  }
}
