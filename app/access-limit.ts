// Global fallback deliberately does not trust client-supplied IP headers.
// Bound shared-code guesses across cookie, header and login routes.
// Established random sessions are validated separately, outside this budget.
export const ACCESS_WINDOW_MS = 60_000;
export const ACCESS_LIMIT = 120;
export async function accessLimit(request: Request): Promise<Response | null> {
  void request;
  try {
    const { env } = await import("cloudflare:workers");
    const now = Date.now();
    const start = Math.floor(now / ACCESS_WINDOW_MS) * ACCESS_WINDOW_MS;
    const row = await env.DB.prepare(`INSERT INTO access_attempts (key, window_start, count) VALUES ('global', ?, 1)
      ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start,
      count = CASE WHEN access_attempts.window_start = excluded.window_start THEN access_attempts.count + 1 ELSE 1 END
      WHERE access_attempts.window_start != excluded.window_start OR access_attempts.count < ? RETURNING count`)
      .bind(start, ACCESS_LIMIT).first();
    if (row) return null;
    return Response.json({ error: "Trop de tentatives, réessayez dans une minute" }, { status: 429, headers: { "Retry-After": String(Math.ceil((start + ACCESS_WINDOW_MS - now) / 1000)), "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Vérification d’accès temporairement indisponible" }, { status: 503 });
  }
}
