export const DEFAULT_EPAPER_SETTINGS = {
  visibleTabs: ["listes", "creche", "meteo", "repas", "metro", "agenda", "iss", "air", "bateaux"],
  activeTab: "agenda",
  preferredTab: "agenda",
  carousel: { enabled: false, intervalSeconds: 120 },
} as const;

const validTabs = new Set<string>(DEFAULT_EPAPER_SETTINGS.visibleTabs);

export type EpaperSettings = {
  visibleTabs: readonly string[];
  activeTab: string;
  preferredTab: string;
  carousel: { enabled: boolean; intervalSeconds: number };
};

export function normalizeEpaperSettings(value: unknown): EpaperSettings {
  const input = value && typeof value === "object" ? value as Partial<EpaperSettings> : {};
  const visibleTabs = Array.isArray(input.visibleTabs)
    ? input.visibleTabs.filter((tab): tab is string => typeof tab === "string" && validTabs.has(tab)).filter((tab, index, all) => all.indexOf(tab) === index).slice(0, 9)
    : [...DEFAULT_EPAPER_SETTINGS.visibleTabs];
  const tabs = visibleTabs.length ? visibleTabs : ["listes"];
  const activeTab = typeof input.activeTab === "string" && tabs.includes(input.activeTab) ? input.activeTab : tabs[0];
  const preferredTab = typeof input.preferredTab === "string" && tabs.includes(input.preferredTab) ? input.preferredTab : activeTab;
  const carouselInput = input.carousel && typeof input.carousel === "object" ? input.carousel : {};
  const seconds = Number((carouselInput as Partial<EpaperSettings["carousel"]>).intervalSeconds);
  return { visibleTabs: tabs, activeTab, preferredTab, carousel: { enabled: Boolean((carouselInput as Partial<EpaperSettings["carousel"]>).enabled), intervalSeconds: Number.isFinite(seconds) ? Math.max(30, Math.min(3600, Math.round(seconds))) : 120 } };
}

async function settingsDb() {
  const { env } = await import("cloudflare:workers");
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)").run();
  return env.DB;
}

export async function readEpaperSettings() {
  const db = await settingsDb();
  const row = await db.prepare("SELECT value, updated_at FROM app_settings WHERE key = ?").bind("epaper_settings").first<{ value?: string; updated_at: number }>();
  try {
    return { ...normalizeEpaperSettings(row?.value ? JSON.parse(row.value) : null), revision: row?.updated_at ?? 0 };
  } catch {
    return { ...normalizeEpaperSettings(null), revision: row?.updated_at ?? 0 };
  }
}

export async function writeEpaperSettings(value: unknown, revision: number) {
  const db = await settingsDb();
  const current = await readEpaperSettings();
  if (current.revision !== revision) return null;
  const patch = value as Partial<EpaperSettings>;
  const settings = normalizeEpaperSettings({ ...current, ...patch, carousel: { ...current.carousel, ...patch.carousel } });
  const nextRevision = Math.max(Date.now(), revision + 1);
  const json = JSON.stringify(settings);
  const result = revision === 0
    ? await db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('epaper_settings', ?, ?) ON CONFLICT(key) DO NOTHING").bind(json, nextRevision).run()
    : await db.prepare("UPDATE app_settings SET value = ?, updated_at = ? WHERE key = 'epaper_settings' AND updated_at = ?").bind(json, nextRevision, revision).run();
  if (result.meta.changes !== 1) return null;
  return { ...settings, revision: nextRevision };
}
