import { asc, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { shoppingItems, shoppingLists } from "../../../db/schema";
import { requireSupervieAccess } from "../../access";
import { isJsonRecord, positiveInteger, text } from "../input-validation";

const MUTATION_RETENTION_MS = 24 * 60 * 60 * 1000;

async function mutationHash(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readAll() {
  const db = await getDb();
  let lists = await db.select().from(shoppingLists).orderBy(asc(shoppingLists.createdAt));
  if (lists.length === 0) {
    const { env } = await import("cloudflare:workers");
    await env.DB.prepare(
      `INSERT INTO shopping_lists (name, created_at)
       SELECT value, ? FROM json_each('["Courses", "Maison", "Pharmacie"]')
       WHERE NOT EXISTS (SELECT 1 FROM shopping_lists)`,
    ).bind(Date.now()).run();
    lists = await db.select().from(shoppingLists).orderBy(asc(shoppingLists.createdAt));
  }
  const ids = lists.map((list) => list.id);
  const items = ids.length ? await db.select().from(shoppingItems).where(inArray(shoppingItems.listId, ids)).orderBy(asc(shoppingItems.createdAt)) : [];
  return lists.map((list) => ({ ...list, items: items.filter((item) => item.listId === list.id) }));
}

export async function GET(request: Request) {
  try {
    const denied = await requireSupervieAccess(request);
    if (denied) return denied;
    return Response.json({ lists: await readAll() });
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erreur base de données" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const denied = await requireSupervieAccess(request);
    if (denied) return denied;
    const body: unknown = await request.json().catch(() => null);
    if (!isJsonRecord(body) || typeof body.action !== "string") return Response.json({ error: "Action invalide" }, { status: 400 });
    const mutationId = request.headers.get("x-supervie-mutation-id");
    if (mutationId && !/^[a-zA-Z0-9_-]{16,80}$/.test(mutationId)) {
      return Response.json({ error: "Identifiant de mutation invalide" }, { status: 400 });
    }
    const { env } = await import("cloudflare:workers");
    const now = Date.now();
    let actionStatement: D1PreparedStatement;
    let expectedChanges: number | null = null;
    let constraintError = "";
    switch (body.action) {
      case "createList": { const name = text(body.name, 80); if (!name) return Response.json({ error: "Nom requis" }, { status: 400 }); actionStatement = env.DB.prepare("INSERT INTO shopping_lists (name, created_at) SELECT ?, ? WHERE (SELECT COUNT(*) FROM shopping_lists) < 40").bind(name, now); expectedChanges = 1; constraintError = "40 listes maximum"; break; }
      case "renameList": { const name = text(body.name, 80); const id = positiveInteger(body.id); if (!id || !name) return Response.json({ error: "Données manquantes" }, { status: 400 }); actionStatement = env.DB.prepare("UPDATE shopping_lists SET name = ? WHERE id = ?").bind(name, id); break; }
      case "deleteList": { const id = positiveInteger(body.id); if (!id) return Response.json({ error: "Données manquantes" }, { status: 400 }); actionStatement = env.DB.prepare("DELETE FROM shopping_lists WHERE id = ?").bind(id); break; }
      case "addItem": { const label = text(body.label, 160); const listId = positiveInteger(body.listId); if (!listId || !label) return Response.json({ error: "Données manquantes" }, { status: 400 }); actionStatement = env.DB.prepare("INSERT INTO shopping_items (list_id, label, created_at) SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM shopping_items WHERE list_id = ?) < 200").bind(listId, label, now, listId); expectedChanges = 1; constraintError = "200 articles maximum par liste"; break; }
      case "addItems": { if (!Array.isArray(body.labels) || body.labels.some((label) => typeof label !== "string")) return Response.json({ error: "Articles invalides" }, { status: 400 }); const labels = body.labels.map((label) => text(label, 160)).filter((label): label is string => Boolean(label)); const listId = positiveInteger(body.listId); if (!listId || !labels.length) return Response.json({ error: "Données manquantes" }, { status: 400 }); if (labels.length > 200) return Response.json({ error: "200 articles maximum par import" }, { status: 400 }); actionStatement = env.DB.prepare("INSERT INTO shopping_items (list_id, label, created_at) SELECT ?, value, ? FROM json_each(?) WHERE (SELECT COUNT(*) FROM shopping_items WHERE list_id = ?) + ? <= 200").bind(listId, now, JSON.stringify(labels), listId, labels.length); expectedChanges = labels.length; constraintError = "200 articles maximum par liste"; break; }
      case "toggleItem": { const id = positiveInteger(body.id); if (!id || typeof body.checked !== "boolean") return Response.json({ error: "Données manquantes" }, { status: 400 }); actionStatement = env.DB.prepare("UPDATE shopping_items SET checked = ? WHERE id = ?").bind(body.checked, id); break; }
      case "deleteItem": { const id = positiveInteger(body.id); if (!id) return Response.json({ error: "Données manquantes" }, { status: 400 }); actionStatement = env.DB.prepare("DELETE FROM shopping_items WHERE id = ?").bind(id); break; }
      case "clearChecked": { const listId = positiveInteger(body.listId); if (!listId) return Response.json({ error: "Données manquantes" }, { status: 400 }); actionStatement = env.DB.prepare("DELETE FROM shopping_items WHERE list_id = ? AND checked = true").bind(listId); break; }
      default: return Response.json({ error: "Action inconnue" }, { status: 400 });
    }
    if (mutationId) {
      const requestHash = await mutationHash(body);
      await env.DB.prepare("DELETE FROM list_mutations WHERE expires_at IS NOT NULL AND expires_at <= ?").bind(now).run();
      try {
        const results = await env.DB.batch([
          env.DB.prepare("INSERT INTO list_mutations (id, request_hash, completed, outcome, created_at, expires_at) VALUES (?, ?, true, 'applied', ?, ?)").bind(mutationId, requestHash, now, now + MUTATION_RETENTION_MS),
          actionStatement,
          expectedChanges === null
            ? env.DB.prepare("UPDATE list_mutations SET outcome = 'applied' WHERE id = ?").bind(mutationId)
            : env.DB.prepare("UPDATE list_mutations SET outcome = CASE WHEN changes() = ? THEN 'applied' ELSE 'rejected' END WHERE id = ?").bind(expectedChanges, mutationId),
        ]);
        if (expectedChanges !== null && results[1].meta.changes !== expectedChanges) return Response.json({ error: constraintError }, { status: 400 });
        return Response.json({ lists: await readAll() });
      } catch (error) {
        const existing = await env.DB.prepare("SELECT completed, request_hash, outcome FROM list_mutations WHERE id = ?").bind(mutationId).first<{ completed: number; request_hash: string | null; outcome: string | null }>();
        if (existing?.request_hash && existing.request_hash !== requestHash) {
          return Response.json({ error: "Clé de mutation déjà utilisée pour un autre contenu" }, { status: 409 });
        }
        if (existing?.completed && existing.outcome === "rejected") return Response.json({ error: constraintError || "Action refusée", replayed: true }, { status: 400 });
        if (existing?.completed) return Response.json({ lists: await readAll(), replayed: true });
        if (existing?.completed) return Response.json({ lists: await readAll(), replayed: true });
        throw error;
      }
    }
    /*switch (body.action) {
      case "createList": {
        const name = text(body.name, 80);
        if (!name) return Response.json({ error: "Nom requis" }, { status: 400 });
        const { env } = await import("cloudflare:workers");
        const result = await env.DB.prepare(
          "INSERT INTO shopping_lists (name, created_at) SELECT ?, ? WHERE (SELECT COUNT(*) FROM shopping_lists) < 40",
        ).bind(name, Date.now()).run();
        if (result.meta.changes !== 1) return Response.json({ error: "40 listes maximum" }, { status: 400 });
        break;
      }
      case "renameList": { const name = text(body.name, 80); const id = positiveInteger(body.id); if (!id || !name) return Response.json({ error: "Données manquantes" }, { status: 400 }); await db.update(shoppingLists).set({ name }).where(eq(shoppingLists.id, id)); break; }
      case "deleteList": { const id = positiveInteger(body.id); if (!id) return Response.json({ error: "Données manquantes" }, { status: 400 }); await db.delete(shoppingLists).where(eq(shoppingLists.id, id)); break; }
      case "addItem": {
        const label = text(body.label, 160);
        const listId = positiveInteger(body.listId);
        if (!listId || !label) return Response.json({ error: "Données manquantes" }, { status: 400 });
        const { env } = await import("cloudflare:workers");
        const result = await env.DB.prepare(
          `INSERT INTO shopping_items (list_id, label, created_at)
           SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM shopping_items WHERE list_id = ?) < 200`,
        ).bind(listId, label, Date.now(), listId).run();
        if (result.meta.changes !== 1) return Response.json({ error: "200 articles maximum par liste" }, { status: 400 });
        break;
      }
      case "addItems": {
        if (!Array.isArray(body.labels) || body.labels.some((label) => typeof label !== "string")) {
          return Response.json({ error: "Articles invalides" }, { status: 400 });
        }
        const labels = body.labels.map((label) => text(label, 160)).filter((label): label is string => Boolean(label));
        const listId = positiveInteger(body.listId);
        if (!listId || labels.length === 0) return Response.json({ error: "Données manquantes" }, { status: 400 });
        if (labels.length > 200) return Response.json({ error: "200 articles maximum par import" }, { status: 400 });
        // Counting and inserting in separate statements allows simultaneous
        // browsers to both pass the 200-item check. Keep the check inside the
        // single INSERT statement so D1 serializes it with the write.
        const { env } = await import("cloudflare:workers");
        const result = await env.DB.prepare(
          `INSERT INTO shopping_items (list_id, label, created_at)
           SELECT ?, value, ? FROM json_each(?)
           WHERE (SELECT COUNT(*) FROM shopping_items WHERE list_id = ?) + ? <= 200`,
        ).bind(listId, Date.now(), JSON.stringify(labels), listId, labels.length).run();
        if (result.meta.changes !== labels.length) {
          return Response.json({ error: "200 articles maximum par liste" }, { status: 400 });
        }
        break;
      }
      case "toggleItem": { const id = positiveInteger(body.id); if (!id || typeof body.checked !== "boolean") return Response.json({ error: "Données manquantes" }, { status: 400 }); await db.update(shoppingItems).set({ checked: body.checked }).where(eq(shoppingItems.id, id)); break; }
      case "deleteItem": { const id = positiveInteger(body.id); if (!id) return Response.json({ error: "Données manquantes" }, { status: 400 }); await db.delete(shoppingItems).where(eq(shoppingItems.id, id)); break; }
      case "clearChecked": { const listId = positiveInteger(body.listId); if (!listId) return Response.json({ error: "Données manquantes" }, { status: 400 }); await db.delete(shoppingItems).where(and(eq(shoppingItems.listId, listId), eq(shoppingItems.checked, true))); break; }
      default: return Response.json({ error: "Action inconnue" }, { status: 400 });
    }
    if (mutationId) {
      const { env } = await import("cloudflare:workers");
      await env.DB.prepare("UPDATE list_mutations SET completed = true WHERE id = ?").bind(mutationId).run();
    }*/
    const result = await actionStatement.run();
    if (expectedChanges !== null && result.meta.changes !== expectedChanges) return Response.json({ error: constraintError }, { status: 400 });
    return Response.json({ lists: await readAll() });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erreur base de données" }, { status: 500 }); }
}
