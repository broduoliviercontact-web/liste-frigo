// A reserved deadline survives cold starts and also bounds retries after crashes.
// This dedicated app_settings key is unrelated to the user's e-paper settings.
const KEY = "transit_provider_refresh";
export type RefreshState = { nextAttemptAt: number; reason: string };
export async function claimTransitRefresh(now: number, interval: number) {
  const { env } = await import("cloudflare:workers");
  const row = await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, 'refreshing', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    WHERE app_settings.updated_at <= ? RETURNING updated_at`)
    .bind(KEY, now + interval, now).first<{ updated_at: number }>();
  return row?.updated_at ?? null;
}
export async function readTransitRefresh(): Promise<RefreshState | null> {
  const { env } = await import("cloudflare:workers");
  const row = await env.DB.prepare("SELECT value, updated_at FROM app_settings WHERE key = ?")
    .bind(KEY).first<{ value: string; updated_at: number }>();
  return row ? { nextAttemptAt: row.updated_at, reason: row.value } : null;
}
export async function finishTransitRefresh(reservation: number, state: RefreshState) {
  const { env } = await import("cloudflare:workers");
  await env.DB.prepare("UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ? AND updated_at = ?")
    .bind(state.reason, state.nextAttemptAt, KEY, reservation).run();
}
