import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { agendaEvents } from "../../../db/schema";
import { requireSupervieAccess } from "../../access";

type AgendaAction = "create" | "update" | "delete";
type AgendaCategory = "famille" | "creche" | "sante" | "maison" | "travail";

const agendaCategories = new Set<AgendaCategory>(["famille", "creche", "sante", "maison", "travail"]);

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

function cleanTitle(value?: string) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "";
}

function cleanTime(value?: string | null) {
  const time = value?.trim() ?? "";
  return /^\d{2}:\d{2}$/.test(time) ? time : null;
}

function cleanCategory(value?: string) {
  return agendaCategories.has(value as AgendaCategory) ? value as AgendaCategory : "famille";
}

function cleanDuration(value?: number | null) {
  if (!value || !Number.isFinite(value)) return null;
  return Math.min(720, Math.max(15, Math.round(value / 15) * 15));
}

export async function readWeekAgenda() {
  const { monday, sunday, today } = weekBounds();
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
    const body = await request.json() as {
      action?: AgendaAction;
      id?: number;
      date?: string;
      time?: string | null;
      title?: string;
      category?: string;
      durationMinutes?: number | null;
    };
    const db = await getDb();

    if (body.action === "delete") {
      if (!body.id) return Response.json({ error: "Evenement introuvable" }, { status: 400 });
      await db.delete(agendaEvents).where(eq(agendaEvents.id, body.id));
      return Response.json(await readWeekAgenda());
    }

    const date = body.date ?? "";
    const title = cleanTitle(body.title);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) {
      return Response.json({ error: "Evenement incomplet" }, { status: 400 });
    }
    const values = {
      date,
      time: cleanTime(body.time),
      title,
      category: cleanCategory(body.category),
      durationMinutes: cleanDuration(body.durationMinutes),
      updatedAt: new Date(),
    };

    if (body.action === "update") {
      if (!body.id) return Response.json({ error: "Evenement introuvable" }, { status: 400 });
      await db.update(agendaEvents).set(values).where(eq(agendaEvents.id, body.id));
    } else {
      await db.insert(agendaEvents).values({ ...values, createdAt: new Date() });
    }

    return Response.json(await readWeekAgenda());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erreur agenda" }, { status: 500 });
  }
}
