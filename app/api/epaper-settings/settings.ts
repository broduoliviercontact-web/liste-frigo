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
  const row = await db.prepare("SELECT value FROM app_settings WHERE key = ?").bind("epaper_settings").first<{ value?: string }>();
  try {
    return normalizeEpaperSettings(row?.value ? JSON.parse(row.value) : null);
  } catch {
    return normalizeEpaperSettings(null);
  }
}

export async function writeEpaperSettings(value: unknown) {
  const settings = normalizeEpaperSettings(value);
  const db = await settingsDb();
  await db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind("epaper_settings", JSON.stringify(settings), Date.now()).run();
  return settings;
}
