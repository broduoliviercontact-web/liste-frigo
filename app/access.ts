const ACCESS_COOKIE = "supervie_access";
const ACCESS_HEADER = "x-supervie-access-code";

async function configuredAccessCode() {
  const { env } = await import("cloudflare:workers");
  return typeof env.SUPERVIE_ACCESS_CODE === "string" ? env.SUPERVIE_ACCESS_CODE : "";
}

function cookieValue(header: string | null, name: string) {
  if (!header) return "";
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

export async function hasSupervieAccess(request: Request) {
  const expected = await configuredAccessCode();
  const provided = request.headers.get(ACCESS_HEADER) ?? cookieValue(request.headers.get("cookie"), ACCESS_COOKIE);
  return expected.length > 0 && provided.length === expected.length && provided === expected;
}

export async function requireSupervieAccess(request: Request) {
  if (await hasSupervieAccess(request)) return null;
  return Response.json({ error: "Accès SUPERVIE requis" }, { status: 401 });
}

export async function acceptSupervieCode(code: string) {
  const expected = await configuredAccessCode();
  return expected.length > 0 && code.length === expected.length && code === expected;
}

export const supervieAccessCookie = `${ACCESS_COOKIE}=`;
