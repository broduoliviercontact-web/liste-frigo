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
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Réglages invalides" }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (typeof input.revision !== "number" || !Number.isSafeInteger(input.revision) || input.revision < 0) return Response.json({ error: "Rechargez les réglages avant de les modifier" }, { status: 428 });
  const { revision, ...patch } = input;
  const saved = await writeEpaperSettings(patch, revision as number);
  return saved ? Response.json(saved) : Response.json({ error: "Réglages modifiés ailleurs : rechargez puis réessayez" }, { status: 409 });
}
