// Home location: 11 avenue du Colonel Fabien, Pantin.
const PANTIN_LATITUDE = 48.8924;
const PANTIN_LONGITUDE = 2.4248;
const WEATHER_CACHE_MS = 2 * 60 * 1000;

type MetNoPoint = {
  time: string;
  data?: {
    instant?: { details?: { air_temperature?: number; cloud_area_fraction?: number } };
    next_1_hours?: { summary?: { symbol_code?: string } };
    next_6_hours?: { summary?: { symbol_code?: string } };
  };
};

type MetNoResponse = {
  properties?: { meta?: { updated_at?: string }; timeseries?: MetNoPoint[] };
};

type OpenMeteoCurrentResponse = {
  current?: { temperature_2m?: number; precipitation?: number; rain?: number; showers?: number; weather_code?: number };
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

function weatherCode(symbol = "cloudy") {
  if (symbol.includes("thunder")) return 95;
  if (symbol.includes("snow") || symbol.includes("sleet")) return 73;
  if (symbol.includes("rain") || symbol.includes("showers")) return 61;
  if (symbol.includes("fog")) return 45;
  if (symbol.includes("partlycloudy")) return 2;
  if (symbol.includes("cloudy")) return 3;
  return 0;
}

function localParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")) };
}

function symbolFor(point: MetNoPoint) {
  return point.data?.next_1_hours?.summary?.symbol_code ?? point.data?.next_6_hours?.summary?.symbol_code ?? "cloudy";
}

function currentWeatherCode(point: MetNoPoint) {
  const cloudCover = point.data?.instant?.details?.cloud_area_fraction;
  if (typeof cloudCover !== "number") return weatherCode(symbolFor(point));
  if (cloudCover < 20) return 0;
  if (cloudCover < 70) return 2;
  return 3;
}

function openMeteoWeatherCode(weatherCode?: number, precipitation?: number) {
  if (typeof precipitation === "number" && precipitation >= 0.05) return 61;
  if (weatherCode === 0) return 0;
  if (weatherCode === 1 || weatherCode === 2) return 2;
  if (weatherCode === 3) return 3;
  if (weatherCode === 45 || weatherCode === 48) return 45;
  return 3;
}

async function readCurrentConditions() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${PANTIN_LATITUDE}&longitude=${PANTIN_LONGITUDE}&current=temperature_2m,precipitation,rain,showers,weather_code&timezone=Europe%2FParis&forecast_days=1`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "SUPERVIE/1.0 contact@supervie.local" },
      cf: { cacheEverything: true, cacheTtl: 120 },
    } as RequestInit);
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    return (await response.json() as OpenMeteoCurrentResponse).current ?? null;
  } catch (error) {
    console.error(`E-paper current weather unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function readPantinWeather(): Promise<EpaperWeather> {
  if (cachedWeather && Date.now() < cacheExpiresAt) return cachedWeather;

  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${PANTIN_LATITUDE}&lon=${PANTIN_LONGITUDE}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "SUPERVIE/1.0 contact@supervie.local" },
      // Cloudflare keeps the provider response at the edge between e-paper polls.
      cf: { cacheEverything: true, cacheTtl: 900 },
    } as RequestInit);
    if (!response.ok) throw new Error(`MET Norway HTTP ${response.status}`);
    const [data, currentConditions] = await Promise.all([
      response.json() as Promise<MetNoResponse>,
      readCurrentConditions(),
    ]);
    const points = data.properties?.timeseries ?? [];
    const current = points[0];
    const currentTemperature = current?.data?.instant?.details?.air_temperature;
    if (!current || typeof currentTemperature !== "number") {
      throw new Error("Réponse météo incomplète");
    }
    const currentLocal = localParts(current.time);
    const hourly = points.slice(1).flatMap((point) => {
      const temperature = point.data?.instant?.details?.air_temperature;
      if (typeof temperature !== "number") return [];
      const local = localParts(point.time);
      return [{ time: `${local.date}T${String(local.hour).padStart(2, "0")}:00`, temperature: Math.round(temperature), weatherCode: weatherCode(symbolFor(point)), isDay: symbolFor(point).endsWith("_day") }];
    }).slice(0, 12);
    const daily = (date: string) => points.filter((point) => localParts(point.time).date === date)
      .map((point) => point.data?.instant?.details?.air_temperature).filter((temperature): temperature is number => typeof temperature === "number");
    const todayTemperatures = daily(currentLocal.date);
    const tomorrowDate = localParts(points.find((point) => localParts(point.time).date > currentLocal.date)?.time ?? current.time).date;
    const tomorrowTemperatures = daily(tomorrowDate);
    const todaySymbol = symbolFor(current);
    const tomorrowPoint = points.find((point) => localParts(point.time).date === tomorrowDate) ?? current;
    const weather: EpaperWeather = {
      status: "ready",
      location: "Pantin",
      timezone: "Europe/Paris",
      updatedAt: data.properties?.meta?.updated_at ?? new Date().toISOString(),
      // Prefer the short-lived current-conditions feed for rain now. MET's
      // symbol remains the fallback because it describes a future period.
      current: {
        time: current.time,
        temperature: Math.round(currentConditions?.temperature_2m ?? currentTemperature),
        weatherCode: currentConditions ? openMeteoWeatherCode(currentConditions.weather_code, currentConditions.precipitation) : currentWeatherCode(current),
        isDay: todaySymbol.endsWith("_day"),
      },
      today: todayTemperatures.length ? { min: Math.round(Math.min(...todayTemperatures)), max: Math.round(Math.max(...todayTemperatures)), weatherCode: weatherCode(todaySymbol) } : undefined,
      tomorrow: tomorrowTemperatures.length ? { date: tomorrowDate, min: Math.round(Math.min(...tomorrowTemperatures)), max: Math.round(Math.max(...tomorrowTemperatures)), weatherCode: weatherCode(symbolFor(tomorrowPoint)) } : undefined,
      hourly,
    };
    cachedWeather = weather;
    cacheExpiresAt = Date.now() + WEATHER_CACHE_MS;
    return weather;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`E-paper weather unavailable: ${message}`);
    return { status: "unavailable", location: "Pantin", timezone: "Europe/Paris" };
  }
}
