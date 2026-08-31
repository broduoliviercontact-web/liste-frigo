import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { mealPlans } from "../../../db/schema";

type MealMoment = "midi" | "soir";

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
  schemaReady = (async () => {
    const { env } = await import("cloudflare:workers");
    await env.DB.batch([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS meal_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, moment TEXT NOT NULL, label TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
      env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS meal_plans_date_moment_unique ON meal_plans (date, moment)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS meal_plans_date_idx ON meal_plans (date)"),
    ]);
  })();
  return schemaReady;
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

export async function GET() {
  try {
    return Response.json(await readWeekMeals());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erreur repas" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureMealSchema();
    const body = await request.json() as { date?: string; moment?: MealMoment; label?: string };
    const date = body.date ?? "";
    const moment = body.moment;
    const label = body.label?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (moment !== "midi" && moment !== "soir")) {
      return Response.json({ error: "Créneau invalide" }, { status: 400 });
    }

    const db = await getDb();
    if (!label) {
      await db.delete(mealPlans).where(and(eq(mealPlans.date, date), eq(mealPlans.moment, moment)));
    } else {
      await db.insert(mealPlans).values({ date, moment, label: label.slice(0, 100), updatedAt: new Date() })
        .onConflictDoUpdate({ target: [mealPlans.date, mealPlans.moment], set: { label: label.slice(0, 100), updatedAt: new Date() } });
    }
    return GET();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erreur repas" }, { status: 500 });
  }
}
