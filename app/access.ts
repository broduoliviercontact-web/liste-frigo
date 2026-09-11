import { accessLimit } from "./access-limit";
const ACCESS_COOKIE = "supervie_access";
const ACCESS_HEADER = "x-supervie-access-code";
const SESSION_COOKIE = "supervie_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

async function configuredAccessCode() {
  const { env } = await import("cloudflare:workers");
  if (typeof env.SUPERVIE_ACCESS_CODE === "string" && env.SUPERVIE_ACCESS_CODE.length > 0) {
    return env.SUPERVIE_ACCESS_CODE;
  }
  return process.env.NODE_ENV === "development" ? "supervie" : "";
}

function cookieValue(header: string | null, name: string) {
  if (!header) return "";
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

function decodedCookieValue(header: string | null, name: string) {
  const value = cookieValue(header, name);
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed cookie is not an access credential.  More importantly, it
    // must not turn an authorization check into a 500 response.
    return "";
  }
}

export async function hasSupervieAccess(request: Request) {
  if (await hasSupervieSession(request)) return true;
  const expected = await configuredAccessCode();
  const provided = request.headers.get(ACCESS_HEADER) ?? decodedCookieValue(request.headers.get("cookie"), ACCESS_COOKIE);
  return expected.length > 0 && provided.length === expected.length && provided === expected;
}

export async function requireSupervieAccess(request: Request) {
  if (await hasSupervieSession(request)) return null;
  const limited = await accessLimit(request);
  if (limited) return limited;
  if (await hasSupervieAccess(request)) return null;
  return Response.json({ error: "Accès SUPERVIE requis" }, { status: 401 });
}

export async function acceptSupervieCode(code: string) {
  const expected = await configuredAccessCode();
  return expected.length > 0 && code.length === expected.length && code === expected;
}

export const supervieAccessCookie = `${ACCESS_COOKIE}=`;

async function sessionHash(token: string) {
  const code = await configuredAccessCode();
  if (!code) return null;
  // Binding to the configured code revokes existing sessions when it changes.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${token}:${code}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hasSupervieSession(request: Request) {
  const token = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const hash = await sessionHash(token);
  if (!hash) return false;
  const { env } = await import("cloudflare:workers");
  return !!(await env.DB.prepare("SELECT 1 FROM access_sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(hash, Date.now()).first());
}

export async function supervieSessionHeaders(request: Request) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const hash = await sessionHash(token);
  if (!hash) throw new Error("Accès non configuré");
  const { env } = await import("cloudflare:workers");
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM access_sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("INSERT INTO access_sessions (token_hash, expires_at) VALUES (?, ?)").bind(hash, now + SESSION_MS),
  ]);
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("set-cookie", `${SESSION_COOKIE}=${token}; ${supervieCookieOptions(request)}`);
  headers.append("set-cookie", `${ACCESS_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
  return headers;
}

export function supervieCookieOptions(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  return `Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}
