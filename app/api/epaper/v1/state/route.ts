import { epaperTransit } from "../../../transit/state";
import { readAll } from "../../../lists/route";
import { readWeekMeals } from "../../../meals/route";
import { readPantinWeather } from "../weather";
import { readTransit } from "../../../transit/route";
import { requireSupervieAccess } from "../../../../access";
import { readIss } from "../../../iss/route";
import { readAirTraffic } from "../../../air/route";
import { readWeekAgenda } from "../../../agenda/route";
import { readBoats } from "../../../boats/route";
import { BOATS_ROUTE } from "../../../../../server/services/aisService";
import { DEFAULT_EPAPER_SETTINGS, readEpaperSettings } from "../../../epaper-settings/settings";

type PageResult<T> = { value: T; available: boolean };
const PAGE_TIMEOUT_MS = 12_000;

async function page<T>(name: string, source: Promise<T>, fallback: T): Promise<PageResult<T>> {
  try {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        source,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(`délai dépassé après ${PAGE_TIMEOUT_MS / 1000}s`)), PAGE_TIMEOUT_MS);
        }),
      ]);
      return { value, available: true };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  } catch (error) {
    console.error(`E-paper ${name} unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return { value: fallback, available: false };
  }
}

export async function GET(request: Request) {
  try {
    const denied = await requireSupervieAccess(request);
    if (denied) return denied;
    const now = new Date();
    const { env } = await import("cloudflare:workers");
    const localMocks = env.SUPERVIE_LOCAL_MOCKS === "true";
    const unavailableWeather = { status: "unavailable" as const, location: "Pantin" as const, timezone: "Europe/Paris" as const };
    const unavailableIss = {
      status: "unavailable" as const, updatedAt: now.toISOString(), speedKmh: 27598, over: "ISS indisponible",
      latitude: null, longitude: null, altitudeKm: null, track: [], pastTrack: [], futureTrack: [],
    };
    const [listsResult, weatherResult, mealsResult, transitResult, agendaResult, issResult, airResult, boatsResult, settingsResult] = await Promise.all([
      page("lists", readAll(), []),
      page("weather", localMocks ? Promise.resolve(unavailableWeather) : readPantinWeather(), unavailableWeather),
      page("meals", readWeekMeals(), { monday: "", sunday: "", meals: [] }),
      page("transit", readTransit(), { status: "unavailable", updatedAt: "", lines: [] }),
      page("agenda", readWeekAgenda(), { layout: "horizontal", monday: "", sunday: "", today: "", eventCount: 0, events: [], upcoming: [], days: [] }),
      page<{ status: "ready" | "unavailable"; updatedAt: string; speedKmh: number; over: string; latitude: number | null; longitude: number | null; altitudeKm: number | null; track: Array<{ latitude: number; longitude: number }>; pastTrack: Array<{ latitude: number; longitude: number }>; futureTrack: Array<{ latitude: number; longitude: number }> }>("iss", localMocks ? Promise.resolve(unavailableIss) : readIss(), unavailableIss),
      page("air traffic", readAirTraffic(), await readAirTraffic(now)),
      page("boats", readBoats(), { status: "degraded" as const, updatedAt: now.toISOString(), route: BOATS_ROUTE, boats: [] }),
      page("settings", readEpaperSettings(), DEFAULT_EPAPER_SETTINGS),
    ]);
    const { value: lists } = listsResult;
    const { value: weather } = weatherResult;
    const { value: meals } = mealsResult;
    const { value: transit } = transitResult;
    const { value: agenda } = agendaResult;
    const { value: iss } = issResult;
    const { value: air } = airResult;
    const { value: boats } = boatsResult;
    const { value: epaperSettings } = settingsResult;
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
      activeTab: epaperSettings.activeTab,
      epaperSettings,
      selectedListId: selectedList?.id ?? null,
      pages: {
        listes: {
          status: listsResult.available ? "ready" : "unavailable",
          // The firmware has room for eight lists and 24 entries per list.
          // Remaining purchases come first, so checked history never hides an
          // actionable item. overflow communicates that the device is partial.
          lists: orderedLists.slice(0, 8).map((list) => {
            const items = [...list.items].sort((a, b) => Number(a.checked) - Number(b.checked));
            return {
              ...list,
              items: items.slice(0, 24),
              remainingCount: items.filter((item) => !item.checked).length,
              overflow: Math.max(0, items.length - 24),
            };
          }),
          overflow: Math.max(0, orderedLists.length - 8),
        },
        meteo: weather,
        repas: { status: mealsResult.available ? "ready" : "unavailable", ...meals },
        agenda: {
          status: agendaResult.available ? "ready" : "unavailable",
          mode: agenda.layout,
          monday: agenda.monday,
          sunday: agenda.sunday,
          today: agenda.today,
          eventCount: agenda.eventCount,
          upcoming: agenda.upcoming.slice(0, 2),
          days: agenda.days.map((day) => ({
            date: day.date,
            dayIndex: day.dayIndex,
            items: day.events.slice(0, 2).map((event) => ({
              time: event.time,
              label: event.title,
              category: event.category,
            })),
            overflow: Math.max(0, day.events.length - 2),
          })),
        },
        metro: epaperTransit(transit),
        iss: {
          status: iss.status,
          updatedAt: iss.updatedAt,
          speedKmh: iss.speedKmh,
          over: iss.over,
          latitude: iss.latitude,
          longitude: iss.longitude,
          altitudeKm: iss.altitudeKm,
          home: { label: "Nous", latitude: 48.895, longitude: 2.409 },
          track: iss.track ?? [],
          pastTrack: iss.latitude != null && iss.longitude != null && iss.pastTrack
            ? [{ latitude: iss.latitude, longitude: iss.longitude }, ...[...iss.pastTrack].reverse()]
            : [],
          futureTrack: iss.futureTrack ?? iss.track ?? [],
        },
        air: {
          ...air,
          status: airResult.available ? "ready" : "unavailable",
          aircraft: air.aircraft.map((plane) => ({
            callsign: plane.callsign,
            registration: plane.registration,
            tailNumber: plane.tailNumber,
            airline: plane.airline,
            aircraftType: plane.aircraftType,
            route: plane.route,
            bearing: plane.bearing,
            x: plane.x,
            y: plane.y,
            heading: plane.heading,
            altitudeM: plane.altitudeM,
            speedKmh: plane.speedKmh,
            distanceKm: plane.distanceKm,
            past: plane.past,
            future: plane.future,
          })),
        },
        bateaux: boats,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Erreur base de données" },
      { status: 500 },
    );
  }
}
