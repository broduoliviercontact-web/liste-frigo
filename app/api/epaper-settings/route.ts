import { requireSupervieAccess } from "../../access";
import { readEpaperSettings, writeEpaperSettings } from "./settings";

export async function GET(request: Request) {
  const denied = await requireSupervieAccess(request);
  if (denied) return denied;
  return Response.json(await readEpaperSettings());
}

export async function POST(request: Request) {
  const denied = await requireSupervieAccess(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Réglages invalides" }, { status: 400 });
  return Response.json(await writeEpaperSettings(body));
}
