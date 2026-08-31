import { readAll } from "../../../lists/route";
import { readWeekMeals } from "../../../meals/route";
import { readPantinWeather } from "../weather";
import { requireSupervieAccess } from "../../../../access";

export async function GET(request: Request) {
  try {
    const denied = await requireSupervieAccess(request);
    if (denied) return denied;
    const [lists, weather, meals] = await Promise.all([readAll(), readPantinWeather(), readWeekMeals()]);
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
      selectedListId: selectedList?.id ?? null,
      pages: {
        listes: {
          status: "ready",
          lists: orderedLists,
        },
        meteo: weather,
        repas: { status: "ready", ...meals },
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Erreur base de données" },
      { status: 500 },
    );
  }
}
