const PANTIN_LATITUDE = 48.8966;
const PANTIN_LONGITUDE = 2.4017;
const WEATHER_CACHE_MS = 15 * 60 * 1000;

type OpenMeteoResponse = {
  current?: { time?: string; temperature_2m?: number; weather_code?: number; is_day?: number };
  hourly?: { time?: string[]; temperature_2m?: number[]; weather_code?: number[]; is_day?: number[] };
  daily?: { time?: string[]; temperature_2m_min?: number[]; temperature_2m_max?: number[]; weather_code?: number[] };
};

export type EpaperWeather = {
  status: "ready" | "unavailable";
  location: "Pantin";
  timezone: "Europe/Paris";
  updatedAt?: string;
  current?: { time: string; temperature: number; weatherCode: number; isDay: boolean };
  today?: { min: number; max: number; weatherCode: number };
  tomorrow?: { date: string; min: number; max: number; weatherCode: number };
  hourly?: Array<{ time: string; temperature: number; weatherCode: number; isDay: boolean }>;
};

let cachedWeather: EpaperWeather | null = null;
let cacheExpiresAt = 0;

function numberAt(values: number[] | undefined, index: number) {
  const value = values?.[index];
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

export async function readPantinWeather(): Promise<EpaperWeather> {
  if (cachedWeather && Date.now() < cacheExpiresAt) return cachedWeather;

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(PANTIN_LATITUDE));
    url.searchParams.set("longitude", String(PANTIN_LONGITUDE));
    url.searchParams.set("timezone", "Europe/Paris");
    url.searchParams.set("forecast_days", "2");
    url.searchParams.set("current", "temperature_2m,weather_code,is_day");
    url.searchParams.set("hourly", "temperature_2m,weather_code,is_day");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      // Cloudflare keeps the provider response at the edge between e-paper polls.
      cf: { cacheEverything: true, cacheTtl: 900 },
    } as RequestInit);
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    const data = await response.json() as OpenMeteoResponse;
    const current = data.current;
    if (!current?.time || typeof current.temperature_2m !== "number" || typeof current.weather_code !== "number") {
      throw new Error("Réponse météo incomplète");
    }

    const nextHour = `${current.time.slice(0, 13)}:00`;
    const firstForecastIndex = (data.hourly?.time ?? []).findIndex((time) => time > nextHour);
    const start = firstForecastIndex >= 0 ? firstForecastIndex : 0;
    const hourly = (data.hourly?.time ?? []).slice(start, start + 12).flatMap((time, offset) => {
      const index = start + offset;
      const temperature = numberAt(data.hourly?.temperature_2m, index);
      const weatherCode = numberAt(data.hourly?.weather_code, index);
      if (temperature === null || weatherCode === null) return [];
      return [{ time, temperature, weatherCode, isDay: data.hourly?.is_day?.[index] === 1 }];
    });

    const todayMin = numberAt(data.daily?.temperature_2m_min, 0);
    const todayMax = numberAt(data.daily?.temperature_2m_max, 0);
    const tomorrowMin = numberAt(data.daily?.temperature_2m_min, 1);
    const tomorrowMax = numberAt(data.daily?.temperature_2m_max, 1);
    const weather: EpaperWeather = {
      status: "ready",
      location: "Pantin",
      timezone: "Europe/Paris",
      updatedAt: new Date().toISOString(),
      current: { time: current.time, temperature: Math.round(current.temperature_2m), weatherCode: Math.round(current.weather_code), isDay: current.is_day === 1 },
      today: todayMin === null || todayMax === null ? undefined : { min: todayMin, max: todayMax, weatherCode: numberAt(data.daily?.weather_code, 0) ?? current.weather_code },
      tomorrow: tomorrowMin === null || tomorrowMax === null ? undefined : { date: data.daily?.time?.[1] ?? "", min: tomorrowMin, max: tomorrowMax, weatherCode: numberAt(data.daily?.weather_code, 1) ?? current.weather_code },
      hourly,
    };
    cachedWeather = weather;
    cacheExpiresAt = Date.now() + WEATHER_CACHE_MS;
    return weather;
  } catch (error) {
    console.error(`E-paper weather unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "unavailable", location: "Pantin", timezone: "Europe/Paris" };
  }
}
