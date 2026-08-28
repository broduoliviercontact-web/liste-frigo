import { asc, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { shoppingItems, shoppingLists } from "../../../../../db/schema";

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

export async function GET() {
  try {
    const lists = await readLists();

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
            lists,
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
