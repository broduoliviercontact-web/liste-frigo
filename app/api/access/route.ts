import { acceptSupervieCode, hasSupervieAccess, supervieAccessCookie, supervieCookieOptions } from "../../access";

export async function GET(request: Request) {
  return Response.json({ authorized: await hasSupervieAccess(request) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  if (!(await acceptSupervieCode(code))) {
    return Response.json({ error: "Code invalide" }, { status: 401 });
  }
  return new Response(JSON.stringify({ authorized: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `${supervieAccessCookie}${encodeURIComponent(code)}; ${supervieCookieOptions(request)}`,
    },
  });
}
