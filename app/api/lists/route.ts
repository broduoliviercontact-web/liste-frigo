import { asc, eq, inArray, and } from "drizzle-orm";
import { getDb } from "../../../db";
import { shoppingItems, shoppingLists } from "../../../db/schema";

export async function readAll() {
  const db = await getDb();
  let lists = await db.select().from(shoppingLists).orderBy(asc(shoppingLists.createdAt));
  if (lists.length === 0) {
    await db.insert(shoppingLists).values([{ name: "Courses" }, { name: "Maison" }, { name: "Pharmacie" }]);
    lists = await db.select().from(shoppingLists).orderBy(asc(shoppingLists.createdAt));
  }
  const ids = lists.map((list) => list.id);
  const items = ids.length ? await db.select().from(shoppingItems).where(inArray(shoppingItems.listId, ids)).orderBy(asc(shoppingItems.createdAt)) : [];
  return lists.map((list) => ({ ...list, items: items.filter((item) => item.listId === list.id) }));
}

export async function GET() {
  try { return Response.json({ lists: await readAll() }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erreur base de données" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; id?: number; listId?: number; name?: string; label?: string; checked?: boolean };
    const db = await getDb();
    switch (body.action) {
      case "createList": { const name = body.name?.trim(); if (!name) return Response.json({ error: "Nom requis" }, { status: 400 }); await db.insert(shoppingLists).values({ name }); break; }
      case "renameList": { const name = body.name?.trim(); if (!body.id || !name) return Response.json({ error: "Données manquantes" }, { status: 400 }); await db.update(shoppingLists).set({ name }).where(eq(shoppingLists.id, body.id)); break; }
      case "deleteList": if (body.id) await db.delete(shoppingLists).where(eq(shoppingLists.id, body.id)); break;
      case "addItem": { const label = body.label?.trim(); if (!body.listId || !label) return Response.json({ error: "Données manquantes" }, { status: 400 }); await db.insert(shoppingItems).values({ listId: body.listId, label }); break; }
      case "toggleItem": if (body.id) await db.update(shoppingItems).set({ checked: Boolean(body.checked) }).where(eq(shoppingItems.id, body.id)); break;
      case "clearChecked": if (body.listId) await db.delete(shoppingItems).where(and(eq(shoppingItems.listId, body.listId), eq(shoppingItems.checked, true))); break;
      default: return Response.json({ error: "Action inconnue" }, { status: 400 });
    }
    return Response.json({ lists: await readAll() });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erreur base de données" }, { status: 500 }); }
}
