import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { mealPlans } from "../../../db/schema";
import { requireSupervieAccess } from "../../access";
import { isJsonRecord, isoDate, text } from "../input-validation";

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
  return { monday, sunday: noon.toISOString().slice(0, 10) };
}

let schemaReady: Promise<void> | null = null;

async function ensureMealSchema() {
  if (schemaReady) return schemaReady;
  const setup = (async () => {
    const { env } = await import("cloudflare:workers");
    await env.DB.batch([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS meal_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, moment TEXT NOT NULL, label TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
      env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS meal_plans_date_moment_unique ON meal_plans (date, moment)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS meal_plans_date_idx ON meal_plans (date)"),
    ]);
  })();
  schemaReady = setup;
  try {
    await setup;
  } catch (error) {
    schemaReady = null;
    throw error;
  }
}

export async function readWeekMeals() {
  await ensureMealSchema();
  const { monday, sunday } = weekBounds();
  const db = await getDb();
  const meals = await db.select().from(mealPlans)
    .where(and(gte(mealPlans.date, monday), lte(mealPlans.date, sunday)))
    .orderBy(asc(mealPlans.date), asc(mealPlans.moment));
  const mondayNoon = Date.parse(`${monday}T12:00:00Z`);
  return {
    monday,
    sunday,
    meals: meals.map((meal) => ({
      date: meal.date,
      dayIndex: Math.round((Date.parse(`${meal.date}T12:00:00Z`) - mondayNoon) / 86_400_000),
      moment: meal.moment,
      label: meal.label,
    })),
  };
}

export async function GET(request: Request) {
  try {
    const denied = await requireSupervieAccess(request);
    if (denied) return denied;
    return Response.json(await readWeekMeals());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erreur repas" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireSupervieAccess(request);
    if (denied) return denied;
    await ensureMealSchema();
    const body: unknown = await request.json().catch(() => null);
    if (!isJsonRecord(body)) return Response.json({ error: "Données invalides" }, { status: 400 });
    const date = isoDate(body.date);
    const moment = body.moment;
    const label = text(body.label, 100);
    if (!date || (moment !== "midi" && moment !== "soir") || label === null) {
      return Response.json({ error: "Créneau invalide" }, { status: 400 });
    }

    const db = await getDb();
    if (!label) {
      await db.delete(mealPlans).where(and(eq(mealPlans.date, date), eq(mealPlans.moment, moment)));
    } else {
      await db.insert(mealPlans).values({ date, moment, label: label.slice(0, 100), updatedAt: new Date() })
        .onConflictDoUpdate({ target: [mealPlans.date, mealPlans.moment], set: { label: label.slice(0, 100), updatedAt: new Date() } });
    }
    return Response.json(await readWeekMeals());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erreur repas" }, { status: 500 });
  }
}
