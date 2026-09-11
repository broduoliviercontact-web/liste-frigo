import { accessLimit } from "../../access-limit";
import { acceptSupervieCode, hasSupervieAccess, hasSupervieSession, supervieSessionHeaders } from "../../access";

export async function GET(request: Request) {
  if (await hasSupervieSession(request)) return Response.json({ authorized: true }, { headers: { "Cache-Control": "no-store" } });
  const limited = await accessLimit(request); if (limited) return limited;
  const authorized = await hasSupervieAccess(request);
  return Response.json({ authorized }, { headers: authorized ? await supervieSessionHeaders(request) : { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (await hasSupervieSession(request)) return Response.json({ authorized: true }, { headers: { "Cache-Control": "no-store" } });
  const limited = await accessLimit(request); if (limited) return limited;
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  if (!(await acceptSupervieCode(code))) {
    return Response.json({ error: "Code invalide" }, { status: 401 });
  }
  return Response.json({ authorized: true }, { headers: await supervieSessionHeaders(request) });
}
