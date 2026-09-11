import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { agendaEvents } from "../../../db/schema";
import { requireSupervieAccess } from "../../access";
import { agendaTime, boundedDuration, isJsonRecord, isoDate, positiveInteger, text } from "../input-validation";

type AgendaCategory = "famille" | "creche" | "sante" | "maison" | "travail";
type AgendaLayout = "horizontal" | "vertical";

const agendaCategories = new Set<AgendaCategory>(["famille", "creche", "sante", "maison", "travail"]);
const agendaLayouts = new Set<AgendaLayout>(["horizontal", "vertical"]);
let agendaSchemaReady: Promise<void> | null = null;

function parisDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function weekBounds() {
  const today = parisDate();
  const noon = new Date(`${today}T12:00:00Z`);
  const mondayOffset = (noon.getUTCDay() + 6) % 7;
  noon.setUTCDate(noon.getUTCDate() - mondayOffset);
  const monday = noon.toISOString().slice(0, 10);
  noon.setUTCDate(noon.getUTCDate() + 6);
  return { monday, sunday: noon.toISOString().slice(0, 10), today };
}

function dateFromMonday(monday: string, index: number) {
  const date = new Date(`${monday}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

function cleanLayout(value: unknown) {
  return typeof value === "string" && agendaLayouts.has(value as AgendaLayout) ? value as AgendaLayout : null;
}

async function ensureAgendaSchema() {
  if (agendaSchemaReady) return agendaSchemaReady;
  const setup = (async () => {
    const { env } = await import("cloudflare:workers");
    await env.DB.batch([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS agenda_events (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, time TEXT, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'famille', duration_minutes INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS agenda_events_date_idx ON agenda_events (date)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS agenda_events_date_time_idx ON agenda_events (date, time)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
    ]);
  })();
  agendaSchemaReady = setup;
  try {
    await setup;
  } catch (error) {
    agendaSchemaReady = null;
    throw error;
  }
}

async function readAgendaLayout() {
  await ensureAgendaSchema();
  const { env } = await import("cloudflare:workers");
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind("agenda_layout").first<{ value?: string }>();
  return cleanLayout(row?.value) ?? "horizontal";
}

async function writeAgendaLayout(layout: AgendaLayout) {
  await ensureAgendaSchema();
  const { env } = await import("cloudflare:workers");
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind("agenda_layout", layout, Date.now())
    .run();
}

export async function readWeekAgenda() {
  await ensureAgendaSchema();
  const { monday, sunday, today } = weekBounds();
  const layout = await readAgendaLayout();
  const db = await getDb();
  const events = await db.select().from(agendaEvents)
    .where(and(gte(agendaEvents.date, monday), lte(agendaEvents.date, sunday)))
    .orderBy(asc(agendaEvents.date), asc(agendaEvents.time), asc(agendaEvents.createdAt));
  const mondayNoon = Date.parse(`${monday}T12:00:00Z`);
  const normalizedEvents = events.map((event) => ({
    id: event.id,
    date: event.date,
    dayIndex: Math.round((Date.parse(`${event.date}T12:00:00Z`) - mondayNoon) / 86_400_000),
    time: event.time ?? "",
    title: event.title,
    category: event.category,
    durationMinutes: event.durationMinutes ?? null,
  }));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = dateFromMonday(monday, index);
    return {
      date,
      dayIndex: index,
      events: normalizedEvents.filter((event) => event.date === date),
    };
  });
  const upcoming = normalizedEvents
    .filter((event) => event.date >= today)
    .slice(0, 4);

  return {
    layout,
    monday,
    sunday,
    today,
    eventCount: normalizedEvents.length,
    events: normalizedEvents,
    upcoming,
    days,
  };
}

export async function GET(request: Request) {
  try {
    const denied = await requireSupervieAccess(request);
    if (denied) return denied;
    return Response.json(await readWeekAgenda());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erreur agenda" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireSupervieAccess(request);
    if (denied) return denied;
    const body: unknown = await request.json().catch(() => null);
    if (!isJsonRecord(body) || typeof body.action !== "string") return Response.json({ error: "Action invalide" }, { status: 400 });
    const db = await getDb();

    if (body.action === "setLayout") {
      const layout = cleanLayout(body.layout);
      if (!layout) return Response.json({ error: "Disposition invalide" }, { status: 400 });
      await writeAgendaLayout(layout);
      return Response.json(await readWeekAgenda());
    }

    if (body.action === "delete") {
      const id = positiveInteger(body.id);
      if (!id) return Response.json({ error: "Evenement introuvable" }, { status: 400 });
      await db.delete(agendaEvents).where(eq(agendaEvents.id, id));
      return Response.json(await readWeekAgenda());
    }

    if (body.action !== "create" && body.action !== "update") return Response.json({ error: "Action invalide" }, { status: 400 });

    const date = isoDate(body.date);
    const title = text(body.title, 80);
    const time = agendaTime(body.time);
    const durationMinutes = boundedDuration(body.durationMinutes);
    const category = typeof body.category === "string" && agendaCategories.has(body.category as AgendaCategory) ? body.category as AgendaCategory : null;
    if (!date || !title || time === undefined || durationMinutes === undefined || !category) {
      return Response.json({ error: "Evenement incomplet" }, { status: 400 });
    }
    const values = {
      date,
      time,
      title,
      category,
      durationMinutes,
      updatedAt: new Date(),
    };

    if (body.action === "update") {
      const id = positiveInteger(body.id);
      if (!id) return Response.json({ error: "Evenement introuvable" }, { status: 400 });
      await db.update(agendaEvents).set(values).where(eq(agendaEvents.id, id));
    } else {
      await db.insert(agendaEvents).values({ ...values, createdAt: new Date() });
    }

    return Response.json(await readWeekAgenda());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erreur agenda" }, { status: 500 });
  }
}
