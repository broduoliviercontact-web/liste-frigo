import { asc, inArray } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { appState, shoppingItems, shoppingLists } from "../../../../../db/schema";

const ACTIVE_LIST_KEY = "active_list_id";

type EpaperList = {
  id: number;
  name: string;
  items: Array<{
    id: number;
    label: string;
    checked: boolean;
  }>;
};

async function readLists(): Promise<EpaperList[]> {
  const db = await getDb();
  let lists = await db.select().from(shoppingLists).orderBy(asc(shoppingLists.createdAt));

  if (lists.length === 0) {
    await db.insert(shoppingLists).values([{ name: "Courses" }, { name: "Maison" }, { name: "Pharmacie" }]);
    lists = await db.select().from(shoppingLists).orderBy(asc(shoppingLists.createdAt));
  }

  const ids = lists.map((list) => list.id);
  const items = ids.length
    ? await db.select().from(shoppingItems).where(inArray(shoppingItems.listId, ids)).orderBy(asc(shoppingItems.createdAt))
    : [];

  return lists.map((list) => ({
    id: list.id,
    name: list.name,
    items: items
      .filter((item) => item.listId === list.id)
      .map((item) => ({
        id: item.id,
        label: item.label,
        checked: item.checked,
      })),
  }));
}

async function readActiveListId(lists: EpaperList[]) {
  const db = await getDb();
  const [row] = await db.select().from(appState).where(eq(appState.key, ACTIVE_LIST_KEY)).limit(1);
  const activeListId = Number(row?.value);
  return lists.some((list) => list.id === activeListId) ? activeListId : lists[0]?.id ?? 0;
}

export async function GET() {
  try {
    const lists = await readLists();
    const activeListId = await readActiveListId(lists);
    const activeList = lists.find((list) => list.id === activeListId) ?? lists[0];
    const orderedLists = activeList ? [activeList, ...lists.filter((list) => list.id !== activeList.id)] : lists;

    return Response.json(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        display: {
          logicalWidth: 540,
          logicalHeight: 960,
          orientation: "portrait",
        },
        activeTab: "listes",
        activeListId,
        tabs: [
          { id: "listes", label: "Listes", title: "LISTES" },
          { id: "creche", label: "Crèche", title: "CRECHE" },
          { id: "tenues", label: "Tenues", title: "TENUES" },
          { id: "velib", label: "Vélib", title: "VELIB" },
          { id: "transp", label: "Transp.", title: "TRANSP" },
        ],
        pages: {
          listes: {
            status: "ready",
            subtitle: "Synchronise",
            activeListId,
            lists: orderedLists,
          },
          creche: {
            status: "placeholder",
            title: "CRECHE",
            lines: ["Demo locale", "A connecter ensuite"],
          },
          tenues: {
            status: "placeholder",
            title: "TENUES",
            lines: ["Demo locale", "A connecter ensuite"],
          },
          velib: {
            status: "placeholder",
            title: "VELIB",
            lines: ["Demo locale", "A connecter ensuite"],
          },
          transp: {
            status: "placeholder",
            title: "TRANSP",
            lines: ["Demo locale", "A connecter ensuite"],
          },
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Erreur endpoint e-paper",
      },
      { status: 500 },
    );
  }
}
