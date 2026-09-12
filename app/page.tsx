"use client";

import { APP_VERSION } from "./version";
import { useModalKeyboard } from "./use-modal-keyboard";
import { CSSProperties, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { SerializedMutationQueue, isCurrentSettingsResponse } from "./client-mutation-queue";
import { loadPendingListMutations, PENDING_LIST_MUTATION_TTL_MS, readPendingListMutations, supportsPendingMutationLocks, updatePendingListMutations, withPendingListMutationLock, type PendingListMutation } from "./pending-list-mutations";

type Item = { id: number; label: string; checked: boolean };
type ShoppingList = { id: number; name: string; items: Item[] };
const currentTimestamp = () => Date.now();
type Meal = { id: number; date: string; moment: "midi" | "soir"; label: string };
type AgendaEvent = {
  id: number;
  date: string;
  dayIndex: number;
  time: string;
  title: string;
  category: string;
  durationMinutes: number | null;
};
type AgendaDay = { date: string; dayIndex: number; events: AgendaEvent[] };
type AgendaState = {
  layout: "horizontal" | "vertical";
  monday: string;
  sunday: string;
  today: string;
  eventCount: number;
  events: AgendaEvent[];
  upcoming: AgendaEvent[];
  days: AgendaDay[];
};
type TabId = "lists" | "creche" | "meteo" | "meals" | "metro" | "agenda" | "settings" | "iss" | "air" | "boats";
type EpaperSettings = {
  visibleTabs: TabId[];
  activeTab: TabId;
  carouselEnabled: boolean;
  carouselIntervalSeconds: number;
  configVersion: number;
};
type IssState = {
  sourceUpdatedAt?: string; sourceAgeSeconds?: number; degraded?: boolean;
  status: "ready" | "unavailable";
  updatedAt?: string;
  speedKmh?: number;
  over?: string;
  latitude?: number;
  longitude?: number;
  altitudeKm?: number;
  visibility?: string;
  stale?: boolean;
  track?: Array<{ latitude: number; longitude: number }>;
  pastTrack?: Array<{ latitude: number; longitude: number }>;
  futureTrack?: Array<{ latitude: number; longitude: number }>;
};
type EpaperWeather = {
  status: "ready" | "unavailable";
  location: string;
  updatedAt?: string;
  current?: { time: string; temperature: number; weatherCode: number; isDay: boolean };
  today?: { min: number; max: number; weatherCode: number };
  tomorrow?: { date: string; min: number; max: number; weatherCode: number };
  hourly?: Array<{ time: string; temperature: number; weatherCode: number; isDay: boolean }>;
};

type TransitLine = { id: string; label: string; mode: "metro" | "bus"; stop: string; direction?: string; available: boolean; passages: Array<{ time: string; destination: string }> };
type AirTrafficPlane = {
  id: string;
  callsign: string;
  registration: string;
  tailNumber: string;
  airline: string;
  aircraftType: string;
  route: string;
  bearing: string;
  x: number;
  y: number;
  heading: number;
  altitudeM: number;
  speedKmh: number;
  distanceKm: number;
  flightLevel: string;
};
type AirTrafficState = {
  status: "ready" | "unavailable";
  updatedAt?: string;
  radiusKm?: number;
  scan?: { refreshSeconds: number; mode: "simulation" };
  aircraft: AirTrafficPlane[];
};
type BoatDirection = "PARIS" | "BOBIGNY" | "INDETERMINE";
type BoatSummary = {
  id: string;
  name: string;
  mmsi: string;
  distanceKm: number;
  speedKmh: number;
  heading?: number | null;
  direction: BoatDirection;
  etaMinutes: number | null;
  vesselType?: string;
  progressPercent?: number;
  updatedAt: string;
};
type BoatsRoute = { name: string; from: string; home: string; to: string; lengthKm: number; homeProgressPercent: number };
type BoatsState = { status: "ok" | "degraded"; updatedAt?: string; route?: BoatsRoute; boats: BoatSummary[] };

const tabCatalog: Array<{ id: TabId; label: string; icon: string; epaperKey: string; epaper: boolean }> = [
  { id: "lists", label: "Listes", icon: "🛒", epaperKey: "listes", epaper: true },
  { id: "creche", label: "Crèche", icon: "🧒", epaperKey: "creche", epaper: true },
  { id: "meteo", label: "Météo", icon: "☁", epaperKey: "meteo", epaper: true },
  { id: "meals", label: "Repas", icon: "🍽", epaperKey: "repas", epaper: true },
  { id: "metro", label: "Métro", icon: "Ⓜ", epaperKey: "metro", epaper: true },
  { id: "agenda", label: "Agenda", icon: "◷", epaperKey: "agenda", epaper: true },
  { id: "settings", label: "Réglages", icon: "⚙", epaperKey: "reglages", epaper: false },
  { id: "iss", label: "ISS", icon: "✦", epaperKey: "iss", epaper: true },
  { id: "air", label: "Air", icon: "⌖", epaperKey: "air", epaper: true },
  { id: "boats", label: "Bateaux", icon: "🚢", epaperKey: "bateaux", epaper: true },
];

const epaperTabs = tabCatalog.filter((tab) => tab.epaper);
const MAX_EPAPER_TABS = 9;

const defaultEpaperSettings: EpaperSettings = {
  visibleTabs: ["lists", "creche", "meteo", "meals", "metro", "agenda", "iss", "air", "boats"],
  activeTab: "agenda",
  carouselEnabled: false,
  carouselIntervalSeconds: 120,
  configVersion: 3,
};

function epaperKeyFor(tab: TabId) {
  return tabCatalog.find((entry) => entry.id === tab)?.epaperKey ?? "listes";
}

function localEpaperSettings(value: unknown): EpaperSettings | null {
  if (!value || typeof value !== "object") return null;
  const input = value as { visibleTabs?: unknown; activeTab?: unknown; carousel?: { enabled?: unknown; intervalSeconds?: unknown } };
  if (!Array.isArray(input.visibleTabs) || typeof input.activeTab !== "string") return null;
  const visibleTabs = input.visibleTabs
    .map((key) => typeof key === "string" ? epaperTabs.find((tab) => tab.epaperKey === key)?.id : undefined)
    .filter((tab): tab is TabId => Boolean(tab));
  const activeTab = epaperTabs.find((tab) => tab.epaperKey === input.activeTab)?.id;
  if (!visibleTabs.length || !activeTab || !visibleTabs.includes(activeTab)) return null;
  return {
    visibleTabs,
    activeTab,
    carouselEnabled: Boolean(input.carousel?.enabled),
    carouselIntervalSeconds: Math.max(30, Number(input.carousel?.intervalSeconds) || 120),
    configVersion: defaultEpaperSettings.configVersion,
  };
}

function tabFromQuery() {
  if (typeof window === "undefined") return null;
  const requestedView = new URLSearchParams(window.location.search).get("view");
  return epaperTabs.some((entry) => entry.id === requestedView) ? requestedView as TabId : null;
}

function AppNav({ active, settings, onChange }: { active: TabId; settings: EpaperSettings; onChange: (tab: TabId) => void }) {
  const visibleTabs = (settings.visibleTabs.length ? settings.visibleTabs : defaultEpaperSettings.visibleTabs)
    .filter((tabId) => tabCatalog.find((tab) => tab.id === tabId)?.epaper);
  return <nav className={`app-nav dynamic tabs-${visibleTabs.length}`} aria-label="Navigation principale">
    {visibleTabs.map((tabId) => {
      const tab = tabCatalog.find((entry) => entry.id === tabId);
      if (!tab) return null;
      return <button key={tab.id} className={active === tab.id ? "active" : ""} onClick={() => onChange(tab.id)}>
        <span className="nav-icon" aria-hidden="true">{tab.icon}</span>
        <span>{tab.label}</span>
      </button>;
    })}
  </nav>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function projectWorldPoint(longitude: number, latitude: number) {
  return {
    x: clamp(((longitude + 180) / 360) * 436, 18, 418),
    y: clamp(((90 - latitude) / 180) * 300, 18, 282),
  };
}

function useIssState() {
  const [iss, setIss] = useState<IssState>({ status: "unavailable" });

  useEffect(() => {
    let active = true;
    try {
      const cached = JSON.parse(window.localStorage.getItem("supervie-iss-last-position") ?? "null") as IssState | null;
      if (cached?.status === "ready" && cached.updatedAt && typeof cached.latitude === "number" && typeof cached.longitude === "number") {
        // Cached state is intentionally rendered immediately while the live
        // request below is pending.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIss({ ...cached, stale: true });
      }
    } catch {
      window.localStorage.removeItem("supervie-iss-last-position");
    }
    const load = async () => {
      try {
        const response = await fetch(`/api/iss?at=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("iss");
        const data = await response.json() as IssState;
        if (active) {
          const fresh = { ...data, stale: false };
          setIss(fresh);
          window.localStorage.setItem("supervie-iss-last-position", JSON.stringify(fresh));
        }
      } catch {
        if (active) setIss((current) => current.updatedAt ? { ...current, stale: true } : { status: "unavailable" });
      }
    };
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return iss;
}

function useEpaperWeather() {
  const [weather, setWeather] = useState<EpaperWeather | null>(null);

  useEffect(() => {
    let active = true;
    const loadWeather = async () => {
      try {
        const response = await fetch("/api/epaper/v1/state", { cache: "no-store" });
        if (!response.ok) throw new Error("weather");
        const data = await response.json() as { pages?: { meteo?: EpaperWeather } };
        if (active && data.pages?.meteo) setWeather(data.pages.meteo);
      } catch {
        if (active) setWeather({ status: "unavailable", location: "Pantin" });
      }
    };
    void loadWeather();
    const timer = window.setInterval(loadWeather, 2 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return weather;
}

function useTransit() {
  const [transit, setTransit] = useState<{ updatedAt: string; lines: TransitLine[]; reason?: string; nextAttemptAt?: number } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/transit", { cache: "no-store" });
        if (!response.ok) throw new Error("transit");
        const data = await response.json() as { updatedAt: string; lines: TransitLine[] };
        if (active) setTransit(data);
      } catch { if (active) setTransit({ updatedAt: "", lines: [] }); }
    };
    const firstLoad = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(load, 10 * 60 * 1000);
    return () => { active = false; window.clearTimeout(firstLoad); window.clearInterval(timer); };
  }, []);

  return transit;
}

function useAirTraffic() {
  const [airTraffic, setAirTraffic] = useState<AirTrafficState>({ status: "unavailable", aircraft: [] });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/air?at=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("air");
        const data = await response.json() as AirTrafficState;
        if (active) setAirTraffic(data);
      } catch {
        if (active) setAirTraffic((current) => ({ ...current, status: "unavailable" }));
      }
    };
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return airTraffic;
}

function useBoats() {
  const [state, setState] = useState<BoatsState>({ status: "degraded", boats: [] });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/boats?at=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("boats");
        const data = await response.json() as BoatsState;
        if (active) setState(data);
      } catch {
        if (active) setState((current) => ({ ...current, status: "degraded" }));
      }
    };
    void load();
    const timer = window.setInterval(load, 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return state;
}

function radarBearingFor(plane: { x: number; y: number }) {
  return (Math.atan2(plane.x - 128, 128 - plane.y) * 180 / Math.PI + 360) % 360;
}

const RADAR_SWEEP_MS = 10_000;

function radarSweepAngle(startedAt: number, now = Date.now()) {
  return ((now - startedAt) % RADAR_SWEEP_MS) / RADAR_SWEEP_MS * 360;
}

function didSweepPass(previousAngle: number, currentAngle: number, targetAngle: number) {
  return previousAngle <= currentAngle
    ? targetAngle > previousAngle && targetAngle <= currentAngle
    : targetAngle > previousAngle || targetAngle <= currentAngle;
}

function sameAirTrafficPlane(a?: AirTrafficPlane, b?: AirTrafficPlane) {
  if (!a || !b) return false;
  return a.x === b.x &&
    a.y === b.y &&
    a.heading === b.heading &&
    a.altitudeM === b.altitudeM &&
    a.speedKmh === b.speedKmh &&
    a.distanceKm === b.distanceKm;
}

const initialItems: Item[] = [
  { id: 1, label: "Pain", checked: false },
  { id: 2, label: "Lait", checked: false },
  { id: 3, label: "Café", checked: true },
  { id: 4, label: "Pommes", checked: false },
  { id: 5, label: "Dentifrice", checked: false },
];

const initialLists: ShoppingList[] = [
  { id: 1, name: "Courses", items: initialItems },
  { id: 2, name: "Maison", items: [
    { id: 21, label: "Lessive", checked: false },
    { id: 22, label: "Éponges", checked: false },
  ] },
  { id: 3, name: "Pharmacie", items: [
    { id: 31, label: "Dentifrice", checked: false },
  ] },
];

const groceryEmojis: Array<[string[], string]> = [
  [["pain", "baguette", "brioche", "croissant"], "🍞"],
  [["lait"], "🥛"],
  [["cafe", "café"], "☕"],
  [["pomme", "pommes"], "🍎"],
  [["banane", "bananes"], "🍌"],
  [["orange", "oranges"], "🍊"],
  [["citron", "citrons"], "🍋"],
  [["fraise", "fraises"], "🍓"],
  [["raisin", "raisins"], "🍇"],
  [["tomate", "tomates"], "🍅"],
  [["piment", "piments", "chili"], "🌶️"],
  [["poivron", "poivrons"], "🫑"],
  [["carotte", "carottes"], "🥕"],
  [["aubergine", "aubergines"], "🍆"],
  [["courgette", "courgettes", "concombre", "concombres"], "🥒"],
  [["brocoli", "brocolis"], "🥦"],
  [["mais", "maïs"], "🌽"],
  [["patate", "patates", "pomme de terre"], "🥔"],
  [["salade", "laitue"], "🥬"],
  [["oignon", "oignons"], "🧅"],
  [["ail"], "🧄"],
  [["avocat", "avocats"], "🥑"],
  [["champignon", "champignons"], "🍄"],
  [["oeuf", "oeufs", "œuf", "œufs"], "🥚"],
  [["fromage"], "🧀"],
  [["beurre"], "🧈"],
  [["yaourt", "yogourt"], "🥣"],
  [["poulet"], "🍗"],
  [["viande", "steak"], "🥩"],
  [["poisson", "saumon", "thon"], "🐟"],
  [["riz"], "🍚"],
  [["pates", "pâtes"], "🍝"],
  [["sucre", "cassonade"], "🍬"],
  [["sel", "poivre", "épice", "epice", "épices", "epices"], "🧂"],
  [["farine"], "🌾"],
  [["pizza"], "🍕"],
  [["chocolat"], "🍫"],
  [["miel"], "🍯"],
  [["eau"], "💧"],
  [["jus"], "🧃"],
  [["biere", "bière"], "🍺"],
  [["vin"], "🍷"],
  [["savon"], "🧼"],
  [["dentifrice"], "🪥"],
  [["papier toilette", "sopalin", "essuie-tout"], "🧻"],
  [["couche", "couches", "lingette", "lingettes"], "👶"],
  [["lessive"], "🧺"],
  [["éponge", "eponge"], "🧽"],
];

function emojiFor(label: string) {
  const normalized = label.toLocaleLowerCase("fr").trim();
  return groceryEmojis.find(([words]) =>
    words.some((word) => normalized.includes(word)),
  )?.[1] ?? "🛒";
}

type WeatherMode = "canicule" | "doux" | "pluie" | "froid";

const weatherScenarios: Record<WeatherMode, {
  label: string; icon: string; now: string; morning: string; evening: string;
  rain: string; image: string; clothes: string[]; feeling: string; advice: string;
}> = {
  canicule: { label: "Canicule", icon: "☀", now: "20°", morning: "20,3°C", evening: "34,7°C", rain: "0% pluie", image: "/avatars/cesar-canicule-epaper.png", clothes: ["Body manches courtes", "T-shirt léger", "Short léger"], feeling: "Très chaud", advice: "Chapeau + crème solaire" },
  doux: { label: "Doux", icon: "☁", now: "14°", morning: "13,8°C", evening: "19,2°C", rain: "10% pluie", image: "/avatars/cesar-doux-epaper.png", clothes: ["T-shirt", "Petit gilet", "Pantalon léger"], feeling: "Temps doux", advice: "Gilet facile à retirer" },
  pluie: { label: "Pluie", icon: "☂", now: "13°", morning: "12,6°C", evening: "15,4°C", rain: "80% pluie", image: "/avatars/cesar-pluie-epaper.png", clothes: ["Ciré imperméable", "Pantalon", "Bottes de pluie"], feeling: "Pluvieux", advice: "Parapluie + tenue de rechange" },
  froid: { label: "Froid", icon: "❄", now: "3°", morning: "2,4°C", evening: "6,8°C", rain: "10% pluie", image: "/avatars/cesar-froid-epaper.png", clothes: ["Manteau chaud", "Bonnet + écharpe", "Pantalon + bottines"], feeling: "Très froid", advice: "Bien couvrir les extrémités" },
};

function CrechePage({ settings, onTab }: { settings: EpaperSettings; onTab: (tab: TabId) => void }) {
  const liveWeather = useEpaperWeather();
  const temperature = liveWeather?.current?.temperature;
  const weatherCode = liveWeather?.current?.weatherCode ?? 3;
  const mode: WeatherMode = weatherCode >= 61 ? "pluie" : (temperature ?? 20) <= 7 ? "froid" : (temperature ?? 20) >= 25 ? "canicule" : "doux";
  const weather = weatherScenarios[mode];
  const returnHour = liveWeather?.hourly?.find((hour) => hourLabel(hour.time) === "17");
  const departureTemperature = temperature === undefined ? weather.morning : `${temperature}°C`;
  const returnTemperature = returnHour ? `${returnHour.temperature}°C` : liveWeather?.today ? `${liveWeather.today.max}°C` : weather.evening;
  const rainLabel = weatherCode >= 61 ? "Pluie en cours" : "Pas de pluie";
  return <div className="creche-page">
    <header className="creche-header">
      <div><p className="eyebrow">MÉTÉO CRÈCHE</p><h1>{liveWeather?.location ?? "Pantin"}</h1></div>
      <div className="weather-now"><strong>{temperature === undefined ? weather.now : `${temperature}°`}</strong><span>{weatherIcon(weatherCode, liveWeather?.current?.isDay)}</span><small>MÉTÉO ACTUELLE</small></div>
    </header>
    <section className="morning-card">
      <div className="period-title"><div><p className="eyebrow">MAINTENANT</p><strong>{departureTemperature}</strong></div><span>{rainLabel}</span></div>
      <div className="avatar-and-clothes">
        <div className="baby-avatar">
          {/* This local illustration is intentionally served as-is. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={weather.image} alt={`César habillé pour un temps ${weather.label.toLowerCase()}, avec son doudou girafe`} />
        </div>
        <ul>{weather.clothes.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
    </section>
    <section className="evening-card">
      <div><p className="eyebrow">RETOUR · 17H</p><strong>{returnTemperature}</strong></div>
      <div className="sun-advice"><span>{weatherIcon(returnHour?.weatherCode ?? liveWeather?.today?.weatherCode, true)}</span><p><strong>{weather.feeling}</strong><br />{weather.advice}</p></div>
    </section>
    <p className="weather-update"><span /> {liveWeather?.status === "ready" ? "Météo synchronisée" : "Météo indisponible"}</p>
    <AppNav active="creche" settings={settings} onChange={onTab} />
  </div>;
}

function weatherIcon(weatherCode = 3, isDay = true) {
  if (weatherCode >= 95) return "⛈";
  if (weatherCode >= 61) return "☂";
  if (weatherCode === 45) return "≋";
  if (weatherCode === 2) return isDay ? "⛅" : "☾";
  if (weatherCode === 3) return "☁";
  return isDay ? "☀" : "☾";
}

function weatherDescription(weatherCode = 3) {
  if (weatherCode >= 95) return "Orages";
  if (weatherCode >= 61) return "Pluie";
  if (weatherCode === 45 || weatherCode === 48) return "Brouillard";
  if (weatherCode === 3) return "Nuages dominants";
  if (weatherCode === 2) return "Eclaircies";
  return "Ciel clair";
}

function hourLabel(time: string) {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(time));
  return parts.find((part) => part.type === "hour")?.value ?? "--";
}

function MeteoPage({ settings, onTab }: { settings: EpaperSettings; onTab: (tab: TabId) => void }) {
  const weather = useEpaperWeather();

  const current = weather?.current;
  const today = weather?.today;
  const hourly = (weather?.hourly ?? []).slice(0, 12);
  return <div className="epaper-weather-page">
    <header className="epaper-weather-header">
      <p className="eyebrow">MÉTÉO SUPERVIE</p>
      <h1>{weather?.location ?? "Pantin"}</h1>
    </header>
    <section className="weather-hero" aria-label="Météo actuelle">
      <div><p className="eyebrow">MAINTENANT</p><strong>{current ? `${current.temperature}°` : "--"}</strong></div>
      <span aria-hidden="true">{weatherIcon(current?.weatherCode, current?.isDay)}</span>
    </section>
    <section className="weather-condition">
      <strong>{weatherDescription(current?.weatherCode)}</strong>
      <p>{today ? `Max ${today.max}°   Min ${today.min}°` : "Prévisions indisponibles"}</p>
    </section>
    <section className="epaper-weather-hours" aria-label="Prévisions heure par heure">
      <p className="eyebrow">AUJOURD&apos;HUI</p>
      <div className="weather-hours-row">
        {hourly.map((hour) => <article key={hour.time}><time>{hourLabel(hour.time)} h</time><span>{weatherIcon(hour.weatherCode, hour.isDay)}</span><strong>{hour.temperature}°</strong></article>)}
      </div>
    </section>
    {weather?.tomorrow && <section className="epaper-weather-tomorrow"><div><p className="eyebrow">DEMAIN</p><strong>{weather.tomorrow.min}° · {weather.tomorrow.max}°</strong></div><span>{weatherIcon(weather.tomorrow.weatherCode)}</span></section>}
    <AppNav active="meteo" settings={settings} onChange={onTab} />
  </div>;
}

const mealMoments: Array<{ id: "midi" | "soir"; label: string; icon: string; placeholder: string }> = [
  { id: "midi", label: "Midi", icon: "☀", placeholder: "Ex. pâtes au pesto" },
  { id: "soir", label: "Soir", icon: "☾", placeholder: "Ex. soupe et tartines" },
];

function dateFromMonday(monday: string, offset: number) {
  const date = new Date(`${monday}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function mealDayLabel(date: string, compact = false) {
  const formatted = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", weekday: compact ? "short" : "long", day: "numeric", month: compact ? undefined : "long",
  }).format(new Date(`${date}T12:00:00Z`));
  return formatted.replace(".", "");
}

function MealPlannerPage({ settings, onTab }: { settings: EpaperSettings; onTab: (tab: TabId) => void }) {
  const [monday, setMonday] = useState("");
  const [meals, setMeals] = useState<Meal[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [showWeeklyView, setShowWeeklyView] = useState(false);

  const loadMeals = useCallback(async () => {
    try {
      const response = await fetch("/api/meals", { cache: "no-store" });
      if (!response.ok) throw new Error("meals");
      const data = await response.json() as { monday: string; meals: Meal[] };
      setMonday(data.monday);
      setMeals(data.meals);
      setSelectedDate((current) => current || data.monday);
      setDrafts((current) => {
        const next = { ...current };
        data.meals.forEach((meal) => { next[`${meal.date}-${meal.moment}`] = meal.label; });
        return next;
      });
      setState("ready");
    } catch { setState("error"); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadMeals(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMeals]);

  const days = monday ? Array.from({ length: 7 }, (_, index) => dateFromMonday(monday, index)) : [];
  const selectedDay = selectedDate || monday;
  const mealFor = (date: string, moment: Meal["moment"]) => meals.find((meal) => meal.date === date && meal.moment === moment)?.label;

  async function saveMeal(event: FormEvent, moment: Meal["moment"]) {
    event.preventDefault();
    if (!selectedDay) return;
    const key = `${selectedDay}-${moment}`;
    setState("saving");
    try {
      const response = await fetch("/api/meals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDay, moment, label: drafts[key] ?? "" }),
      });
      if (!response.ok) throw new Error("save");
      const data = await response.json() as { meals: Meal[] };
      setMeals(data.meals);
      setState("ready");
    } catch { setState("error"); }
  }

  return <div className="meals-page">
    <header className="meals-header">
      <div><p className="eyebrow">SUPERVIE · REPAS</p><h1>Cette semaine</h1></div>
      <button className="weekly-view-button" onClick={() => setShowWeeklyView(true)}>Voir la semaine</button>
    </header>
    <section className="week-strip" aria-label="Jours de la semaine">
      {days.map((date) => <button key={date} className={date === selectedDay ? "active" : ""} onClick={() => setSelectedDate(date)}>
        <small>{mealDayLabel(date, true)}</small><strong>{date.slice(-2)}</strong><i>{mealFor(date, "midi") || mealFor(date, "soir") ? "•" : ""}</i>
      </button>)}
    </section>
    <section className="meal-day" aria-live="polite">
      <div className="meal-day-heading"><p className="eyebrow">JOUR SÉLECTIONNÉ</p><h2>{selectedDay ? mealDayLabel(selectedDay) : "Chargement"}</h2></div>
      {mealMoments.map((moment) => {
        const key = `${selectedDay}-${moment.id}`;
        return <form className="meal-slot" key={moment.id} onSubmit={(event) => saveMeal(event, moment.id)}>
          <div className="meal-slot-title"><span aria-hidden="true">{moment.icon}</span><div><p className="eyebrow">{moment.label}</p><strong>{moment.id === "midi" ? "Déjeuner" : "Dîner"}</strong></div></div>
          <label className="visually-hidden" htmlFor={`meal-${moment.id}`}>{moment.label}</label>
          <input id={`meal-${moment.id}`} value={drafts[key] ?? mealFor(selectedDay, moment.id) ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} placeholder={moment.placeholder} />
          <button type="submit">Enregistrer</button>
        </form>;
      })}
    </section>
    <section className="week-overview" aria-label="Aperçu de la semaine">
      {days.map((date) => <button key={date} onClick={() => setSelectedDate(date)}><strong>{mealDayLabel(date, true)}</strong><span>{mealFor(date, "soir") || mealFor(date, "midi") || "À prévoir"}</span></button>)}
    </section>
    <p className={`meal-status ${state}`}><span /> {state === "error" ? "Synchronisation indisponible" : state === "saving" ? "Enregistrement…" : "Repas synchronisés"}</p>
    <AppNav active="meals" settings={settings} onChange={onTab} />
    {showWeeklyView && <section className="weekly-meals-screen" aria-label="Tous les repas de la semaine">
      <header className="weekly-meals-header"><div><p className="eyebrow">SUPERVIE · MENU PARTAGÉ</p><h2>Toute la semaine</h2></div><button onClick={() => setShowWeeklyView(false)} aria-label="Fermer la semaine">×</button></header>
      <div className="weekly-meals-list">
        {days.map((date) => <article key={date}>
          <h3>{mealDayLabel(date)}</h3>
          <p><span>☀ Midi</span><strong>{mealFor(date, "midi") || "À prévoir"}</strong></p>
          <p><span>☾ Soir</span><strong>{mealFor(date, "soir") || "À prévoir"}</strong></p>
        </article>)}
      </div>
    </section>}
  </div>;
}

const agendaCategoryOptions = [
  { id: "famille", label: "Famille", mark: "F" },
  { id: "creche", label: "Crèche", mark: "C" },
  { id: "sante", label: "Santé", mark: "S" },
  { id: "maison", label: "Maison", mark: "M" },
  { id: "travail", label: "Travail", mark: "T" },
];

function agendaCategoryLabel(category: string) {
  return agendaCategoryOptions.find((option) => option.id === category)?.label ?? "Famille";
}

function agendaCategoryMark(category: string) {
  return agendaCategoryOptions.find((option) => option.id === category)?.mark ?? "F";
}

function AgendaPage({ settings, onTab }: { settings: EpaperSettings; onTab: (tab: TabId) => void }) {
  const [agenda, setAgenda] = useState<AgendaState | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [draft, setDraft] = useState({ title: "", time: "", category: "famille", durationMinutes: "60" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingAgenda, setEditingAgenda] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error">("loading");

  const loadAgenda = useCallback(async () => {
    try {
      const response = await fetch("/api/agenda", { cache: "no-store" });
      if (!response.ok) throw new Error("agenda");
      const data = await response.json() as AgendaState;
      setAgenda(data);
      setSelectedDate((current) => current || data.today || data.monday);
      setState("ready");
    } catch { setState("error"); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAgenda(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAgenda]);

  const days = agenda?.days ?? [];
  const selectedDay = selectedDate || agenda?.today || agenda?.monday || "";
  const selectedEvents = days.find((day) => day.date === selectedDay)?.events ?? [];
  const upcoming = agenda?.upcoming ?? [];

  function resetDraft() {
    setDraft({ title: "", time: "", category: "famille", durationMinutes: "60" });
    setEditingId(null);
  }

  function editEvent(event: AgendaEvent) {
    setSelectedDate(event.date);
    setEditingId(event.id);
    setDraft({
      title: event.title,
      time: event.time,
      category: event.category,
      durationMinutes: String(event.durationMinutes ?? 60),
    });
  }

  async function saveEvent(event: FormEvent) {
    event.preventDefault();
    if (!selectedDay) return;
    setState("saving");
    try {
      const response = await fetch("/api/agenda", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingId ? "update" : "create",
          id: editingId ?? undefined,
          date: selectedDay,
          time: draft.time,
          title: draft.title,
          category: draft.category,
          durationMinutes: Number(draft.durationMinutes) || null,
        }),
      });
      if (!response.ok) throw new Error("save");
      const data = await response.json() as AgendaState;
      setAgenda(data);
      resetDraft();
      setState("ready");
    } catch { setState("error"); }
  }

  async function deleteEvent(id: number) {
    setState("saving");
    try {
      const response = await fetch("/api/agenda", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (!response.ok) throw new Error("delete");
      const data = await response.json() as AgendaState;
      setAgenda(data);
      if (editingId === id) resetDraft();
      setState("ready");
    } catch { setState("error"); }
  }

  async function setAgendaLayout(layout: AgendaState["layout"]) {
    if (agenda?.layout === layout) return;
    setState("saving");
    try {
      const response = await fetch("/api/agenda", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setLayout", layout }),
      });
      if (!response.ok) throw new Error("layout");
      const data = await response.json() as AgendaState;
      setAgenda(data);
      setState("ready");
    } catch { setState("error"); }
  }

  return <div className="agenda-page">
    <header className="agenda-header">
      <div><p className="eyebrow">SUPERVIE · AGENDA</p><h1>Semaine compacte</h1></div>
      <div className="agenda-actions"><button onClick={() => setEditingAgenda(true)}>Modifier</button><strong>{agenda?.eventCount ?? 0}</strong></div>
    </header>
    <div className="agenda-layout-toggle" role="group" aria-label="Mode de visualisation agenda">
      <button className={(agenda?.layout ?? "horizontal") === "horizontal" ? "active" : ""} onClick={() => void setAgendaLayout("horizontal")}>Horizontal</button>
      <button className={agenda?.layout === "vertical" ? "active" : ""} onClick={() => void setAgendaLayout("vertical")}>Vertical</button>
    </div>
    <section className="agenda-focus" aria-label="Prochains moments">
      {(upcoming.length ? upcoming.slice(0, 2) : [null, null]).map((event, index) => <article key={event?.id ?? `empty-${index}`}>
        <span>{index === 0 ? "Prochain" : "Ensuite"}</span>
        <strong>{event?.time || "--:--"}</strong>
        <p>{event?.title ?? "À planifier"}</p>
      </article>)}
    </section>
    <section className={`compact-week ${agenda?.layout === "vertical" ? "vertical" : "horizontal"}`} aria-label="Aperçu e-paper de la semaine">
      {days.map((day) => <article key={day.date} className={day.date === agenda?.today ? "today" : ""}>
        <header><span>{mealDayLabel(day.date, true)}</span><strong>{day.date.slice(-2)}</strong></header>
        <div>
          {(day.events.length ? day.events.slice(0, 2) : [{ id: -day.dayIndex, time: "", title: "Libre", category: "famille" }]).map((event) => {
            const emptyEvent = event.id < 0;
            return <p key={event.id} className={emptyEvent ? "empty" : ""}>
              {!emptyEvent && <time>{event.time || "--:--"}</time>}
              <span>{emptyEvent ? "Libre" : <><b>{agendaCategoryMark(event.category)}</b>{event.title}</>}</span>
            </p>;
          })}
        </div>
      </article>)}
    </section>
    <p className={`agenda-note ${state}`}><span /> {state === "error" ? "Synchronisation indisponible" : state === "saving" ? "Enregistrement..." : "2 lignes max par jour · e-paper prêt"}</p>
    <AppNav active="agenda" settings={settings} onChange={onTab} />
    {editingAgenda && <section className="agenda-editor-panel" aria-label="Edition agenda">
      <header><div><p className="eyebrow">AGENDA</p><h2>Modifier la semaine</h2></div><button onClick={() => setEditingAgenda(false)} aria-label="Fermer l'éditeur">×</button></header>
      <div className="agenda-editor">
        <div className="agenda-days">
          {days.map((day) => <button key={day.date} className={day.date === selectedDay ? "active" : ""} onClick={() => setSelectedDate(day.date)}>
            <small>{mealDayLabel(day.date, true)}</small><strong>{day.date.slice(-2)}</strong><i>{day.events.length || ""}</i>
          </button>)}
        </div>
        <form className="agenda-form" onSubmit={saveEvent}>
          <label><span>Titre</span><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Pédiatre, crèche, courses..." maxLength={80} /></label>
          <div>
            <label><span>Heure</span><input type="time" value={draft.time} onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))} /></label>
            <label><span>Durée</span><input type="number" min="15" max="720" step="15" value={draft.durationMinutes} onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: event.target.value }))} /></label>
            <label><span>Catégorie</span><select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}>{agendaCategoryOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          </div>
          <button type="submit">{editingId ? "Modifier" : "Ajouter"}</button>
          {editingId && <button type="button" onClick={resetDraft}>Annuler</button>}
        </form>
        <div className="agenda-day-list">
          {selectedEvents.length ? selectedEvents.map((event) => <article key={event.id}>
            <button type="button" onClick={() => editEvent(event)}><time>{event.time || "Jour"}</time><strong>{event.title}</strong><span>{agendaCategoryLabel(event.category)}</span></button>
            <button type="button" onClick={() => void deleteEvent(event.id)} aria-label={`Supprimer ${event.title}`}>×</button>
          </article>) : <p>Rien prévu ce jour.</p>}
        </div>
      </div>
    </section>}
  </div>;
}

function MetroPage({ settings, onTab }: { settings: EpaperSettings; onTab: (tab: TabId) => void }) {
  const transit = useTransit();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const minutesUntil = (time: string) => Math.max(0, Math.round((Date.parse(time) - now) / 60_000));
  const currentLines = (transit?.lines ?? []).map((line) => ({
    ...line,
    passages: line.passages.filter((passage) => {
      const departureAt = Date.parse(passage.time);
      return Number.isFinite(departureAt) && departureAt >= now - 60_000;
    }),
  }));
  const lines = [...currentLines].sort((a, b) => {
    const aTime = a.passages[0] ? Date.parse(a.passages[0].time) : Number.MAX_SAFE_INTEGER;
    const bTime = b.passages[0] ? Date.parse(b.passages[0].time) : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
  const activeLines = lines.filter((line) => line.available && line.passages.length > 0);
  const unavailableLines = lines.filter((line) => !line.available || line.passages.length === 0);
  const formatNext = (time: string) => {
    const minutes = minutesUntil(time);
    return minutes === 0 ? "À quai" : `${minutes} min`;
  };
  const directionsFor = (line: TransitLine) => Object.values(line.passages.reduce<Record<string, TransitLine["passages"]>>((directions, passage) => {
    const destination = passage.destination || line.direction || line.stop;
    (directions[destination] ??= []).push(passage);
    return directions;
  }, {})).sort((a, b) => Date.parse(a[0]?.time ?? "") - Date.parse(b[0]?.time ?? ""));

  return <div className="metro-page">
    <header className="metro-header"><div><p className="eyebrow">DÉPLACEMENTS SUPERVIE</p><h1>Raymond Queneau</h1><span>Station métro · Bus</span></div><span className="metro-symbol" aria-hidden="true">M</span></header>
    <section className="metro-departures" aria-label="Prochains passages"><header><p className="eyebrow">DÉPARTS À VENIR</p><strong>{activeLines.length ? `${activeLines.length} lignes disponibles` : transit ? "Temps réel indisponible" : "Chargement"}</strong></header>
      <ul>{activeLines.map((line) => {
        const directions = directionsFor(line);
        return <li key={line.id} className="metro-line"><b className={line.mode === "metro" ? "metro-badge" : ""}>{line.label}</b><div className="metro-directions">
          {directions.slice(0, 2).map((passages) => <section key={`${line.id}-${passages[0].destination}`} className="metro-direction">
            <p>{passages[0].destination || line.stop}</p>
            <div className="metro-times"><strong>{formatNext(passages[0].time)}</strong>{passages.slice(1, 3).map((passage) => <span key={passage.time}>{formatNext(passage.time)}</span>)}</div>
          </section>)}
        </div></li>;
      })}</ul>
      {unavailableLines.length > 0 && <p className="metro-unavailable">Temps réel indisponible : {unavailableLines.map((line) => line.label).join(" · ")}</p>}
    </section>
    {transit?.reason === "rate_limited" && <p className="metro-unavailable" role="status">Le fournisseur limite les requêtes. Nouvelle tentative automatique{transit.nextAttemptAt ? ` à ${new Date(transit.nextAttemptAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : " plus tard"}.</p>}
    <p className="metro-note"><span /> {transit?.updatedAt ? `Dernières données : ${new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(transit.updatedAt))}` : transit ? "Aucun passage récent disponible" : "Chargement des passages"}</p>
    <AppNav active="metro" settings={settings} onChange={onTab} />
  </div>;
}

// Natural Earth 1:110m land, simplified for the e-paper preview.
const worldLandPath = "M145.9 283.4L145.5 284.2L145.1 285L137.7 283.8L145.9 283.4ZM25.2 282.5L19.7 281L22.7 280.6L25.2 282.5ZM163.3 280.1L165.5 283.4L156.9 285L154 284.9L152.4 284.4L159.1 280.1L163.3 280.1ZM71.2 272.5L72.8 272.8L74.2 272.5L69.5 272.8L71.2 272.5ZM65.9 272.5L67.8 273.1L63.8 272.4L64.7 272.1L65.9 272.5ZM98.1 269.9L101.5 270.9L94.1 269.8L98.1 269.9ZM135.1 268.3L134.7 270.3L127.2 270.1L130.7 268.7L131.8 265.1L132.9 264.8L133.6 265.4L135.1 268.3ZM147 256.9L142.9 258L142.8 260.3L138.5 263.3L143.1 267.9L144.3 272.8L132.5 277.7L124.5 277.9L128.8 279.8L123.6 280.6L123.6 281.3L123.5 282L147.5 288.7L157.7 286.2L166.2 286.8L183.4 283.9L182 282.1L174.8 282.4L174.5 281.8L174.7 280.6L196.8 275.2L197.8 274.7L199 274.2L199.3 273.5L198.1 273.1L198.5 272.4L199.3 271.9L205.5 268.8L209 269.5L209.1 268.9L209.7 268.2L217.7 269.4L227.4 266.5L231.1 268.1L234.3 266.6L250.8 267.4L256.7 266.1L259 264.2L264.8 266.3L284 259.7L292.4 263.3L295.6 262.3L301.4 263.2L302.4 265L302.4 265.4L300.1 267.2L300.3 267.8L301.6 267.8L300.3 269.8L301.2 270.3L302.6 270.4L307.5 266.5L312 265.8L318.3 262L323.1 261.9L323.9 261.5L324.6 260.3L326.6 261.9L334 262.3L338.8 262.1L342.5 259.3L346.6 261.6L355.6 259.8L363.1 262.1L367.2 260.8L381.2 260.3L381.5 259.5L381.6 258.8L384.5 261.6L394.2 261.5L398.3 264L404.9 264.3L413.7 267.6L425.4 269.5L423 272.8L419.2 274L416.1 277.1L417.5 280.3L419.8 280.5L420.3 281.3L413.9 281.9L411.5 284.9L423.2 289.7L436 291.2L436 300L0 300L0 291.2L0.1 291.2L1.1 290.2L12.2 289.8L26.6 292.3L44.7 291.7L32 289.5L32.9 286.7L28.1 285.2L35.5 285.6L40.7 283.9L29.9 281.8L26.6 280L26.2 278.1L34.7 279L41.1 277.5L40.9 275.6L42.5 275.3L80 272.9L82 274.5L96.1 275.5L96.7 274.8L93.8 273.5L92.4 271L101.3 272.7L108.9 272.2L109.9 270.9L119.3 273.1L120.3 272.5L120.8 271.9L127.3 273.1L136.4 270.8L135 266.2L136 262.2L141.7 257.7L148.7 255.9L148.2 256.4L147 256.9ZM135.9 239.7L137.5 240.8L139.2 241.2L134.2 242.5L127.6 238.1L131.9 240.1L134 237.5L135.9 239.7ZM147.1 235.2L148.1 235.9L147.7 236.5L143.9 236.4L147.1 235.2ZM303.1 232.8L301.3 233L301.5 231L302.3 231.6L303.4 231.8L303.5 232.1L303.1 232.8ZM394.1 218L397.6 218.1L397.1 222L396.7 221.6L395.9 222.7L394.1 221.2L394.1 218ZM427.5 218.2L429 218.9L427.6 223.1L426.7 223.1L425.6 223.7L423.1 227.7L419.9 227L427.5 218.2ZM429.5 210.3L432.1 213.1L434.2 212.8L430.2 219.5L428.5 215.8L429.6 212.3L427.1 207.5L429.5 210.3ZM420.4 186.9L416.7 183.5L420.4 186.9ZM434 178.9L434.4 179.4L434.2 180.3L433.5 180.5L432.8 180.3L434 178.9ZM435.2 178L434.5 178.4L434.3 177.7L436 176.8L436 177.6L435.2 178ZM421.3 177.4L420.5 176.5L421.3 177.4ZM420.4 174.9L420.6 176.2L420.4 174.9ZM278.6 172.6L279 176.2L275.6 189.6L273 192.7L272.3 192.2L271.3 191.6L270.5 188L271.2 179L271.7 178.1L271.8 177L275.8 174.3L277.6 170.1L278.6 172.6ZM391.9 172.9L394.1 175L395.3 181.6L398.3 184L403.5 193.5L403.2 202.7L399.7 212.4L395.2 215.1L393.7 213.2L393 213.5L391.9 214.7L388.3 213.4L385.3 209.4L385.7 208.5L385.4 207.3L384.8 208.5L383.7 208.8L384.9 204.8L382.7 208.2L380.6 204.4L377.1 202.5L370.8 203.7L367.8 206.5L363.2 206.6L360.9 208.4L357.3 207L358.1 202.7L355.3 193.5L356.3 193.8L355.3 190.6L356.2 186.3L356.3 187.5L359.4 184.5L364.4 182.8L370.2 173.7L371.9 173L375 174.9L376.2 170.9L378.6 170.2L378.3 168.5L381.9 170.4L383.3 169.8L382.1 175L387.8 179.5L390.6 167.8L391.9 172.9ZM414.3 167.5L413.4 167L414.1 167.4L414.3 167.5ZM364.2 167.1L363.7 167.1L362.1 165.9L364.2 167.1ZM412.8 166.5L411.4 165.4L412.8 166.5ZM413.8 166L412.5 163.9L413.8 166ZM368.7 166.9L367.7 167.3L367.5 167.1L367.6 166.5L368.2 165.5L372.2 164L368.7 166.9ZM360.8 163.5L362.3 164.5L359.4 165.1L360.8 163.5ZM366.8 163.5L363.2 164.7L366.8 163.5ZM411.6 163.9L409.6 162.4L411.6 163.9ZM408.8 162.2L407.6 161L408.3 161.7L408.8 162.2ZM349.6 161.3L351.9 161.5L352.1 160.8L358.1 164L345.6 161.4L346.4 159.8L349.6 161.3ZM381.2 160.4L380.5 161.5L380.9 159.1L381.2 159.6L381.2 160.4ZM406.8 161.4L405.3 158.4L406.8 161.4ZM402.1 159.1L400 160.5L397.6 159.6L400.6 159.1L401.5 156.9L402.1 159.1ZM372.1 155.8L370.6 155.3L371.8 155.2L372.1 155.8ZM376 155.2L376.5 156.4L372.9 155.7L376 155.2ZM403.5 157.5L400.8 154.2L403.5 157.5ZM380.5 151.9L380.8 154.6L382.1 155.6L385.5 152.8L393.1 156.4L396.8 160.1L396.3 162.3L400.5 167.6L397.1 166.9L393.3 162.7L390.7 165.5L386.5 163.5L386.2 164L384.7 164L385.2 162.7L385.9 162.2L385.6 160.4L385 159L379.9 155.9L379.5 156.7L379.1 156.9L377.9 154.7L379.9 153.7L376.1 151.6L377.7 151.2L378.3 150.6L380.3 151.3L380.5 151.9ZM369.7 147.6L368.7 149.3L367.8 149.6L363.6 149.6L363.4 150.9L364.5 152.3L365.1 151.6L367.4 151L365.2 153.2L367.2 158.9L366.5 159.4L366 158.8L366.6 157.4L365.4 158.1L365.1 157.6L364.5 154.4L363.1 159.5L361.8 154.7L363.4 149.1L364.4 147.8L369.7 147.6ZM373.9 148.1L373.1 151.5L372.9 146.4L373.9 148.1ZM346.2 159.8L342.2 157L333.4 140.9L334.2 140.9L336.1 141.3L343.8 149.8L343.3 151.2L346.5 155.1L346.2 157.2L346.2 159.8ZM360.8 147L362.1 148.5L360.7 148.7L358.7 156.7L351.5 154.9L350.1 147.8L354.9 144.8L359.4 138.5L362.3 141L360.1 144.6L361 146.2L360.8 147ZM371.1 136L369.9 140.7L367.7 136.9L365.9 138.5L365.7 138L366.1 136.6L370 135L369.9 133.7L371.1 136ZM316.4 139.7L315.3 140.1L314.7 138.7L314.5 136.3L315.1 133.6L317.1 137.5L316.9 139.2L316.4 139.7ZM144.2 133.2L143.2 133.3L143 133.2L143.3 132.7L143.3 132.1L144.2 133.2ZM368.2 132.9L367 135L366.9 131.9L367.6 131.8L367.4 132.9L368.3 131.3L368.2 132.9ZM361.5 134.5L359.9 136.1L362.7 131.1L361.5 134.5ZM365.6 130.2L366.3 130.7L367.1 130.7L365.8 132.6L365.6 130.2ZM370 129.7L369.1 133.1L368.5 129.1L369.7 129.1L370 129.7ZM365.2 128.2L364.9 129.7L364.3 128.8L363.7 127.6L364.8 127.6L365.2 128.2ZM364.9 119.2L365.7 119.6L366.1 119.2L366.4 121.5L365.4 126.1L368.1 127L368.3 129.1L364.1 126.9L363.4 125L364.9 119.2ZM138.6 119.6L136.6 119.4L138.6 119.6ZM124.9 120.2L123.3 119.2L124.9 120.2ZM130.1 116.9L135.3 119L131.5 120.7L128.5 119.9L127.8 119.4L127.9 118.9L130.4 118.9L129.1 117.3L129.4 116.8L130.1 116.9ZM351.6 118.9L350.6 119.7L349.6 119.2L349.6 117.7L350.2 117L351.5 116.5L352.2 116.5L351.6 118.9ZM29.6 118.2L29.2 116.2L30.5 117.5L29.6 118.2ZM121.5 112.1L128 116.6L123.8 116.9L124.6 116L122.7 114L118.9 112.3L115.1 113.5L118.4 111.4L121.5 112.1ZM124.1 110.4L123.3 108L124.1 110.4ZM364.8 112L364.2 113.4L363.6 112L363.5 110.7L364.2 109.1L365.1 107.8L364.8 112ZM123.8 105.7L122.4 106L122.3 105.4L123.8 105.7ZM124.7 105.7L124.5 106.9L123.8 104.9L124.7 105.7ZM381.1 93.1L381.2 93.7L380.5 94.7L378.3 95L378.3 94.2L379 93.2L381.1 93.1ZM259.9 90.5L257.3 92.2L259.9 90.5ZM246.7 90.5L249.8 91.2L249.7 91.7L247.9 91.8L246.7 90.5ZM236.8 86.3L236.3 89L233.1 87.3L236.8 86.3ZM229.2 81.3L229.9 82.5L229.7 84.7L229.2 84.6L228.7 85.2L227.9 81.7L228.5 81.8L229.2 81.3ZM388.7 88.1L387.9 91.4L382.5 94.2L381.6 93.6L381.6 92.3L376.6 93.5L377.9 94.8L377.1 97.6L376.3 98.3L375.7 97.6L374.7 94.5L378.6 90.9L381 90.4L382.3 90.8L383.6 87.8L384.4 88.6L386.2 87L386.9 86.3L387.6 84.3L387.4 82.4L387.9 81.3L389.2 81L388.7 88.1ZM229.6 79.7L229.2 81L228.6 80.7L228.3 79.6L228.6 79L229.4 78.3L229.6 79.7ZM392.3 76.4L393.1 76.7L394 76L394.3 77.9L392.5 78.4L391.4 80L389.5 78.9L388.8 80.7L387.5 80.7L389.9 74.1L391.4 75.8L392.3 76.4ZM140.9 72.4L141.8 72.6L142.9 72.6L142.3 73.3L141.9 73.4L140.3 72.7L140 72.1L140.5 71.6L140.9 72.4ZM143.1 68.2L139.9 66.9L143.1 68.2ZM68.4 69.1L67.8 69.4L65.8 68.6L62.5 65.4L65.7 66.2L68.4 69.1ZM150 65.5L149.2 67L153.2 67.9L153.7 72.2L153.2 72.3L152.4 72L152.6 70.6L152.3 70.4L150.9 71.9L149.9 70.6L148.6 70.7L146.2 70.7L148.5 65.5L150.9 64L150.7 64.5L150 65.5ZM57.3 59.9L58.4 59.8L58.1 61.7L59.1 63L57.3 59.9ZM392 65.4L393.2 68.4L391.4 67.8L390.7 70.2L391.8 71.9L391.8 73.1L390.9 72.1L390.1 73.4L389.6 61.2L390.8 59.4L392 65.4ZM209.8 62.9L207.6 63.9L205.9 63.6L206.9 61.9L206.3 60.2L207.9 58.9L208.8 58.1L209.8 58L211.1 59.1L209.8 62.9ZM233.4 57.3L232.6 58.7L231.4 57.7L231.2 57L233 56.5L233.4 57.3ZM32.7 54.8L31.5 55.4L30.9 55L30.7 54.2L33.2 53.5L33.7 54L32.7 54.8ZM214.4 52.3L213.1 54.1L214.3 53.8L215.6 53.9L215.3 55.2L214.2 56.7L220 62.1L219.8 64.5L211.6 66.7L213.9 64.3L212 64L211.6 63.3L212.9 62.8L212.2 61.9L212.5 60.8L214.3 61L214.4 60L211.9 57L211.2 57.8L211.2 56.2L210.6 55.4L211 53.6L211.9 52.3L212.9 52.4L214.4 52.3ZM17.5 50.2L15.2 49.6L17.5 50.2ZM122 46.4L120.7 46.6L122 46.4ZM118.8 45.5L116.3 45.9L118.8 45.5ZM10 43.7L13.7 44.5L10 43.7ZM114.9 40.6L121 43.8L112.4 44.1L114.9 40.6ZM200.4 39.2L200.1 40.3L201.5 41.5L195.4 44.2L193.8 43.9L190.4 43.4L191.6 42.7L189 41.8L191.1 41.5L191.1 41L188.5 40.6L189.4 39.6L191.2 39.3L193.1 40.4L200.4 39.2ZM126.1 38.1L124.8 38.2L124.5 37.4L125 36.4L126.1 36.2L127 36.6L126.1 38.1ZM6 39L9.9 38.5L12.2 40L11 40.8L9 40.9L9 42.6L8.5 42.9L2 41L1.3 40.4L1.6 39.8L0 41.7L0 35.1L3 36.3L6.1 38L6 39ZM102.2 34.8L97.1 34.3L98.2 33.8L99 33.1L102.2 34.8ZM436 31.9L434.7 32L434.5 31.5L436 30.8L436 31.9ZM1.6 31.8L0 31.9L0 30.8L2.9 31.2L2.8 31.4L1.6 31.8ZM108.3 34.2L108.3 35.9L110 34.6L112.2 38L114.4 33.5L116.1 33.7L117.9 33.9L119.6 34.7L119.6 37.3L119.4 38.1L117.1 39.3L115.4 39.6L114.1 39.1L112.2 42L105.2 46.6L103.3 51.8L105.1 52L105.7 53.6L106.2 54.9L118.4 58.1L118.2 59.5L118.5 61.2L119.4 63.1L121.2 64.7L122.1 64.1L122.8 62.4L122.2 59.8L121.3 58.9L125.3 55.8L122.9 52L124.3 50.2L123.8 48.7L123.4 46.1L128.6 45.9L133.7 48.2L133.7 49.6L134.1 51.7L135.2 52L136.1 53L139.8 49.4L143.6 55.1L143.2 56.1L148.6 59L150.6 63.1L145.3 66.3L137.6 66.3L131.9 72L139.2 67.9L140.3 68.8L139.1 69.9L139.5 71.7L139.9 72.9L141.5 73.8L143.5 73.5L144.7 71.7L144.8 72.9L145.6 73.5L138.8 77.4L137.9 77.3L137.9 75.9L140 74.5L138 74.6L136.7 74.8L133.1 77.2L132.2 79.4L133.3 80.6L128.7 81.8L130.5 81.5L130.9 81.8L128.4 82.1L127.3 85.1L126.5 84.2L126 88L125.5 84.7L124.8 86.3L126.3 90.7L119.5 97.6L120.6 108L116.1 99.8L110 99.5L108.8 101.5L104.3 100.5L101 102.8L99.5 112.6L101.4 117.8L103.6 119.8L106.5 118.8L108.7 115L112.6 114.1L110.3 123.5L115.1 123.3L117 124.5L116.5 131.5L119.4 135.4L121.6 134L124.9 135.6L127.3 131.5L131.1 129.3L131.2 134.9L133.3 129.7L135.4 132.4L139.4 133.2L143.1 132.1L142 132.6L142.4 133.4L148.8 140L152.7 140.4L155.8 143L157.5 147.1L157 150.1L159.1 150.4L159.2 152.1L160.1 151L161.6 151.6L163.6 152.6L164.2 153.6L164 154.5L169.6 154.8L174.9 158.6L175.9 162.2L171.2 171.8L168.4 186.6L160.3 191.5L158.8 197.8L152.8 207.3L149.9 208.1L147.2 206.5L149.2 211.5L148.1 213.6L146.3 214.5L143.8 214.9L142.5 214.7L142 218.4L139.1 218.4L139.3 220.1L141.1 220.9L140 221.5L139.1 222.5L138.9 224.2L138.6 225.1L137.4 225.1L136.5 225.9L136.2 227.2L137.3 228.4L138.5 228.7L138.1 230.2L134.3 234.6L134.7 236.3L135.5 237.2L132.2 238.2L132 239.7L127.2 237.1L126.4 231.1L126.9 229.5L128.2 228.2L126.4 227.7L127.5 226.3L128 223.5L129.3 224.1L129.9 220.6L128 222L128.9 211.9L131.5 204L133 182.9L131.5 178.9L125.9 174.4L121.4 162L120.5 160.9L119.6 160.2L121.4 154.4L119.9 153.7L120.2 153.3L120 151.8L124.6 143.6L123.3 136.1L121.6 135.1L120 138L114.3 133.4L112 127.8L107.5 126.8L103.3 123L101.1 123.9L92.6 119.5L90.2 116.8L89.6 112L82.1 101.7L81 98L79 97L85 112L82.1 108.8L82.2 107.5L82 106.6L78.7 103.8L79.7 102.4L75.9 94.9L71.9 92.3L67.3 82.8L67 69.7L67.1 69.4L68.9 69.9L69.5 71.5L69.2 68.3L63.7 65.3L63 63.8L63.2 62.8L55.6 53.1L39.8 48.5L34.3 51.4L35.6 47.9L26.1 56.7L18.4 59.3L27 54L27.2 52.8L27.8 51.8L21.8 52.2L21.7 51.2L22 50.6L21.2 50L19.6 50.3L16.8 47.5L18.7 44.8L23.3 43.7L23.3 42L18.2 42.6L14.4 40.5L16.1 39.9L18.8 39L22.2 39.8L16 36.1L28.4 31.1L52.7 35.2L62.8 32.5L63.6 32.7L65.7 34.2L67.3 33.1L67.5 34.3L70.9 33.7L80.1 36L78.4 36.8L86.1 37.7L87.5 36.9L86.2 36.1L87 35.6L88.5 35.5L89.4 35.3L95.1 37.3L97 37L98.8 37L98.6 36L99.7 35.7L101.6 36.3L101.6 37.8L103.9 34.9L102.6 33.9L101.2 33.2L101.3 31.3L102.7 30.1L104.3 30.4L105.5 31.1L107.2 33L106.1 33.8L108.3 34.2ZM79.7 28.1L79.1 28.9L84.9 28.4L86 28.9L87 30.6L87.6 29.9L86.7 28.2L87.8 27.9L89 28.2L91.5 31.7L95.6 34L93.6 34.2L94.4 34.8L93.9 35.4L80.8 35.8L77.4 34.7L75.9 33.4L81.9 32.7L75.2 32.4L74.6 31.8L77.4 31.2L75.5 31.2L73.4 30.7L74.4 29.5L75.3 28.8L78.5 27.8L79.7 28.1ZM91.4 27.6L90.4 28.7L88.5 27.6L91.4 27.6ZM125.5 28.2L121.7 28.8L120.1 27.2L125.5 28.2ZM113.2 28.1L114.1 29.1L115.2 27.8L118.3 27.1L120.4 28.8L120.2 29.9L122.6 29.4L123.7 28.8L128.3 31.1L130.5 30.7L136.9 34.7L134.7 35.5L143.1 38.6L142.7 39.7L140.6 41.7L135.6 39.6L139.7 44.3L139.3 45.5L137.7 45.1L134.7 43.8L137.9 46.8L127.4 42.2L127.4 42.7L123.9 43L122.9 42.4L123.7 41.2L125.9 41.1L128.4 40.9L129.7 37.1L122.4 33.1L121.7 33.5L119.5 33.8L109.6 32.1L110.9 31.3L109.1 31.3L108.8 29.6L109.7 28.1L110.9 27.4L114.1 27L113.2 28.1ZM96.5 26.9L97.9 27.3L100.1 27.1L100.4 27.6L99.2 28.3L101.1 29.1L100.9 30.6L98.9 31.2L97.7 31.1L96.9 30.4L93.9 29.1L93.9 28.6L96.4 28.8L95 27.7L96.5 26.9ZM391.9 28L387.4 27.7L388.5 27.1L390.1 26.9L391.8 27.5L391.9 28ZM105.1 28.7L103.8 30L102.4 29.9L101.7 28.4L101.7 27.6L102.3 26.9L103.5 26.4L106.1 26.5L108.4 26.9L106.6 28.4L105.1 28.7ZM72.1 31L68.9 31.8L68.3 31.1L65.5 30.2L67.9 27.2L66.7 26.2L78.1 27.5L72.1 31ZM400.6 24.9L395 24.7L400.6 24.9ZM104.6 25L100.7 25.1L101.4 24.4L103.1 23.9L104.2 24.5L104.6 25ZM393.7 24.1L392.8 25.3L388.3 25.3L386.3 25.6L383.9 24.6L384.5 23.4L386.1 23.1L389.3 23.2L393.7 24.1ZM98.7 22.1L99.1 25L93.9 24.1L93.8 22.8L98.7 22.1ZM86.9 23L90 24.2L82.1 26L80.2 26L80.1 25.5L82.6 24.7L77.1 24.9L75.4 24.6L77.1 23L78.2 22.5L85.9 24.2L84.2 22.6L86.9 23ZM287.7 32.1L287 32.3L283 32.1L280.3 30L285.4 24.9L288.1 24L292.1 22.9L301.4 22.4L288.8 26.2L287 27.8L285.1 29.4L285.4 30.8L287.7 32.1ZM103.3 21.5L110 24L119.7 23.8L121 24.4L121.3 25.1L106.1 25.3L104.3 22.8L101.8 22.6L100.4 22.1L100.8 21.4L103.3 21.5ZM77.3 20.6L77.1 21.9L76.2 22.4L69.2 23.1L77.3 20.6ZM347.6 21.7L356.2 23.6L350.5 26.4L367.2 28.4L367.3 27.1L369.8 27.4L371.8 27.4L377 32L378.2 30.3L387.4 30.9L386.5 29.3L388.1 28.6L399.1 29.7L400.1 30.7L403.3 31.9L408.2 31.6L410.6 31.9L412.9 34.3L421.3 34L423.4 35.5L424.9 35L423.9 33.9L424.4 33.2L434.3 34.3L436 35.1L436 41.7L432.9 42.3L435.4 45.7L428.3 47.2L424.3 50.2L422.6 49L416.1 50.2L415.7 51.3L414.2 52.9L414.3 53.6L415.6 54L414.3 58.6L407.9 65L406.8 55.4L416.2 48.1L417.2 45.7L411.9 49.1L410.9 47L407.8 47.6L404.8 50.4L405.8 51.4L403.1 51.9L401.2 52L401.3 50.8L399.4 50.6L390.2 51.6L386.3 54.9L381.7 58.8L385.3 60.4L386.1 59.6L387.4 59.7L389.2 61.5L389.2 62.9L385.4 72.8L381.3 77.7L378.2 77.9L372.5 83.7L374.8 88.7L374.8 90.6L374.3 91.5L371.2 92.7L371.6 88.5L369 86.5L369.8 84.1L364.6 85.2L365.3 81.8L361 84.7L362 87.6L366.2 87.6L362.3 91.8L365.6 97.2L365.4 103L358.4 112L352.2 114.3L351.8 116.1L349.4 113.8L346.2 117.1L350.4 127.6L350.3 130.6L345.4 135.7L344.9 134.6L345.3 133.5L339.2 127.7L338.2 134.6L342.7 140.8L344.2 147.8L340.8 145.4L339.2 139.2L337.3 136L337.1 137L337.6 130.9L335.7 121.8L334.9 122.6L333.5 123.8L332.8 123.7L332.1 123.3L332.5 121.2L332.2 119.6L328.7 112.1L327.3 113.6L323.3 114.2L323.4 115.4L322.8 116.4L315.3 123.5L314.7 132.7L311.9 136.7L307.1 123.3L306 114.4L304.2 115.4L303.3 115.2L298.4 107.6L287.5 107.1L287 105.1L286.4 104.8L285.5 105.1L284.3 105.9L280.4 103.6L279.6 102L278.7 99.8L276.1 100L279.5 108.7L280.5 107L280.7 110L283.4 109.8L286.3 106L286.8 109.6L290.4 112.8L287.9 118.4L284.9 121.3L277 126.7L270.7 128.9L269.7 122L259.9 103.2L260.3 100.8L259.1 103.9L257.3 100.2L262.6 113.3L263.4 119L270.5 129.3L270.4 130L269.7 130.4L272 132.6L279.9 130L279.8 132.3L275.8 143L266.8 154.3L265.5 157.8L267.4 174.5L265.8 177.9L260.1 183L260.9 190.2L257.5 192.9L257 197.9L252.2 204.6L249.2 206.6L241.8 208L240.1 206.4L240.1 202.8L236.4 195.2L235.3 186.9L232.3 180.1L234.6 167.9L232.4 158.4L228.7 151.9L229.4 143.8L228.3 142L225.1 142.9L223.2 139.5L215.6 142.1L207.1 141.9L197.9 129.7L196.7 125.5L198.4 119.8L197.4 113.5L200.5 106.2L206.4 100.1L206.7 95.7L210.8 90.4L215.4 91.4L219.8 89L229.5 87.7L231.4 88.5L230.5 93.7L241.1 99.6L244.1 95.3L253 98.5L255.5 97.4L258.9 98.4L261.8 88.9L257.4 89.8L251.5 88.9L249.7 84.2L253.4 81.3L258.6 80L264.4 81.8L268.5 80.1L262.4 74.6L265.4 71.2L260.3 72.9L262 74.8L260.7 75.1L259 76.1L257.3 74.5L258.3 73.2L255.2 72.4L251.5 79L252.9 81.6L249.9 83.1L248.2 81.8L246.7 82.2L247.6 83.1L246.9 83.4L245.4 82.9L247.1 87.2L246 86.8L245.2 89.3L241.5 82.9L241.7 80.5L233.9 73.8L233.2 76.5L240.4 83.1L238.4 82.6L237.5 86.7L236.7 83.3L228.8 76.1L225.9 78.1L223.5 77.7L221.8 78.2L221.6 79.2L221.7 80.2L220.5 81.3L219 81.6L218.1 85.4L215.4 88.9L211.5 90.1L210.1 88.4L207.2 88.6L206.6 78.3L216.3 76.6L216.6 73.3L212.4 68.9L214 68.5L216 68.9L215.7 67L216.8 67.8L219.6 66.5L223.7 61.5L227.8 60.8L228.3 54.8L230.8 53.8L231.2 55.9L229.7 57.5L231.2 60L241.8 59.3L242.1 58.6L243.8 58L244.1 54.3L247.2 55L247.4 53.7L247.6 52.7L246.3 51.4L253.3 50L245.7 50.3L245 49.3L243.8 48.8L244.1 44.7L248.8 41.5L248.6 40.8L246.9 40L244.9 40.5L243.7 41.6L243.9 42.6L242 44L239.6 45.4L238.7 47.8L239.6 48.9L240.8 49.9L239.6 51.7L238.4 52.1L237.9 54.9L237.2 56.5L233.7 57.7L230.5 50.9L228.2 52.8L226.5 53.2L224.9 52.4L224.4 50.6L224 46.7L230.8 42.5L233 40.2L235.9 37L247.7 31.6L249.9 31.7L252.1 31.4L255.9 32.6L254.3 33L255.7 34.1L266.8 36.8L267.7 37.6L267.8 38.7L266.5 39.6L258.2 38.9L260.2 40.2L260.3 42.6L261.9 43.2L262.8 43.6L263 41.4L266 42.5L267 42.1L266.2 40.8L269 39.2L270.1 39.3L271.2 39.9L270.6 35.7L274 36.2L274.7 37.2L273.2 37.4L273.2 38.3L274.1 38.9L283.1 35.2L284 35.3L282.8 36.3L289.2 35.2L290.6 36.2L292 35.1L290.7 34.1L291.3 33.6L301 36.5L301.8 35.6L299.1 34.2L298.8 31.6L301 30.1L301.8 28.6L302.7 28.3L305.9 28.7L306.2 29.6L305 31L307.2 36L306.7 37.1L304.3 39.5L305.7 39.7L308.9 37.1L307.1 34L308.1 32.3L306.5 30.9L308.7 29.8L308.4 28.6L310.5 31.4L309.9 30.2L312 29.6L314.5 29.5L316.7 30.4L315.6 29L315.5 27.3L323.2 26.8L322.2 25.9L323.6 24.8L340 22.6L344.4 20.5L347.6 21.7ZM104.3 20.8L101.2 20.3L104.3 20.8ZM84.6 20.5L82.3 21L80.5 20.4L84.6 20.5ZM247.9 20.2L245.2 20.9L243.1 20.5L245.7 19.2L246.2 19.9L247.9 20.2ZM85.2 19L83.7 19.3L81.7 19.3L85.2 19ZM101.9 19.9L100.1 20.2L99.2 19.9L98.6 19.2L98.5 18.5L101.9 19.9ZM96.8 19.5L90.6 19.4L91.8 18.9L90.3 18.5L90.2 17.8L96.8 19.5ZM345.3 19.5L338.4 20.1L340.6 17.9L341.6 17.8L345.3 19.5ZM240.1 17.2L244.1 18.4L237.3 22L230.6 17.2L240.1 17.2ZM248.8 16L251.2 16.6L249.4 17.5L245.9 17.7L239 16.1L248.8 16ZM279.9 15.8L275.6 16.6L272.3 15.7L279.9 15.8ZM339 18.5L336.4 18.7L333 18.3L328.4 16.1L331.6 15L334.2 14.6L336.5 15.4L339.3 17L339 18.5ZM112.6 17.2L114.1 17.8L108 19.6L100.9 16.4L106.1 14.6L112.6 17.2ZM135 11.5L143 12.7L136.1 14.2L138.7 14.2L131.8 17L124.9 17.8L126.7 19.1L121.4 21.3L123.7 22L120.4 23L109.6 22.5L109.5 21.7L111.7 21.4L111.1 20.2L111.8 20L115.1 20.8L113.4 19.7L111.5 19.4L114.9 17.8L113.2 17.1L112.7 16.2L118.9 15.9L116.1 15.7L111.9 15.8L107.1 13.5L122 11.4L135 11.5ZM185.2 10.8L192.8 12.1L179.4 13L191.3 13.8L189.9 14.7L193 14.1L198.9 13.5L202.5 13.8L203.2 14.5L193.7 16.4L196.5 16.5L195.1 17.7L194.1 18.7L194.2 20.6L195.6 21.7L193.7 21.8L191.7 22.3L194 23.2L194.3 24.6L193 24.7L194.5 26.2L189.5 27.8L191 29L191 29.7L188.6 29L188 29.4L191.7 32.2L187.1 30.9L187.5 32.1L186.1 33L189.3 33L190.9 33.1L169.8 40.9L166.1 45.5L165.5 49.8L159.5 48.6L155.5 44L152.6 38L156.4 33.5L151.8 34L151.7 32.9L152.2 32L153.3 31.9L155.8 32.4L150.4 30.6L151.7 29L147 24.1L135 23.2L133.6 22.7L131.5 21.7L134.7 21.1L137.1 21L132 20.6L129.2 19.9L138.4 17.7L138.9 17.1L135.6 16.5L142.6 14.5L142.1 13.7L157 12.6L164.1 13.9L161.2 13L161.4 12.3L171.2 10.8L175.5 10.6L185.2 10.8Z";

const homeMarker = { x: 220.9, y: 68.6, label: "Nous" };
const WORLD_TRACK_LEFT = 7;
const WORLD_TRACK_RIGHT = 429;
const WORLD_TRACK_WIDTH = 436;

function projectTrackPoint(longitude: number, latitude: number) {
  return {
    x: ((longitude + 180) / 360) * WORLD_TRACK_WIDTH,
    y: clamp(((90 - latitude) / 180) * 300, 7, 293),
  };
}

function projectIssTrack(track: IssState["track"]) {
  if (!track?.length) return [];
  return track.reduce<Array<Array<[number, number]>>>((segments, point) => {
    const projected = projectTrackPoint(point.longitude, point.latitude);
    const currentSegment = segments.at(-1);
    const previous = currentSegment?.at(-1);
    if (!currentSegment || !previous) {
      segments.push([[projected.x, projected.y]]);
    } else if (Math.abs(projected.x - previous[0]) > WORLD_TRACK_WIDTH / 2) {
      const crossesEast = previous[0] > projected.x;
      const edgeX = crossesEast ? WORLD_TRACK_RIGHT : WORLD_TRACK_LEFT;
      const oppositeEdgeX = crossesEast ? WORLD_TRACK_LEFT : WORLD_TRACK_RIGHT;
      const virtualProjectedX = crossesEast ? projected.x + WORLD_TRACK_WIDTH : projected.x - WORLD_TRACK_WIDTH;
      const t = (edgeX - previous[0]) / (virtualProjectedX - previous[0]);
      const edgeY = previous[1] + (projected.y - previous[1]) * t;
      currentSegment.push([edgeX, edgeY]);
      segments.push([[oppositeEdgeX, edgeY], [projected.x, projected.y]]);
    } else {
      currentSegment.push([projected.x, projected.y]);
    }
    return segments;
  }, []);
}

function IssPage({ settings, onTab }: { settings: EpaperSettings; onTab: (tab: TabId) => void }) {
  const iss = useIssState();
  const currentTrackPoint = typeof iss.latitude === "number" && typeof iss.longitude === "number"
    ? { latitude: iss.latitude, longitude: iss.longitude }
    : null;
  const futureTrackSegments = projectIssTrack(iss.futureTrack ?? iss.track);
  const pastTrackSegments = projectIssTrack(iss.pastTrack && currentTrackPoint ? [currentTrackPoint, ...[...iss.pastTrack].reverse()] : undefined);
  const issPoint = iss.status === "ready" && currentTrackPoint
    ? projectWorldPoint(iss.longitude!, iss.latitude!)
    : null;
  const speed = typeof iss.speedKmh === "number" ? new Intl.NumberFormat("fr-FR").format(iss.speedKmh) : "—";
  const over = iss.over ?? "ISS indisponible";
  const updatedLabel = iss.updatedAt
    ? `${iss.stale ? "Dernière position" : iss.degraded ? "Estimation sur source de repli" : "Position calculée"} · ${new Intl.DateTimeFormat("fr-FR", { timeStyle: "medium" }).format(new Date(iss.updatedAt))} · ${iss.altitudeKm ?? "—"} km d'altitude`
    : "Connexion à la station…";
  const coordinates = typeof iss.latitude === "number" && typeof iss.longitude === "number"
    ? `${Math.abs(iss.latitude).toFixed(2)}° ${iss.latitude >= 0 ? "N" : "S"} · ${Math.abs(iss.longitude).toFixed(2)}° ${iss.longitude >= 0 ? "E" : "O"}`
    : "Position en attente";
  return <div className="iss-page">
    <header className="space-header"><div><p className="eyebrow">ORBITE BASSE</p><h1>ISS Tracker</h1></div><strong>{speed} km/h</strong></header>
    <section className="iss-readout">
      <div><span>Au-dessus de</span><strong>{over}</strong></div>
      <p>{updatedLabel}<br />{coordinates}{iss.sourceUpdatedAt && <><br />Éléments orbitaux du {new Date(iss.sourceUpdatedAt).toLocaleString("fr-FR")}</>}</p>
    </section>
    <section className="world-panel" aria-label="Carte ISS">
      <svg viewBox="0 0 436 300" role="img" aria-label="Carte du monde et trajectoire prévue de l'ISS">
        <defs>
          <pattern id="starfield" width="23" height="19" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="5" r=".7" /><circle cx="18" cy="13" r=".55" /><circle cx="11" cy="17" r=".45" />
          </pattern>
          <clipPath id="world-map-clip">
            <rect x="7" y="7" width="422" height="286" />
          </clipPath>
        </defs>
        <rect className="ocean" x="1" y="1" width="434" height="298" />
        <rect className="stars" x="1" y="1" width="434" height="298" />
        <g className="grid">
          <path d="M1 75H435M1 150H435M1 225H435M109 1V299M218 1V299M327 1V299" />
          <ellipse cx="218" cy="150" rx="198" ry="112" />
        </g>
        <g className="land"><path d={worldLandPath} /></g>
        <g className="home-marker" aria-label="Position de Pantin">
          <circle cx={homeMarker.x} cy={homeMarker.y} r="4" />
          <path d={`M${homeMarker.x - 7} ${homeMarker.y}H${homeMarker.x + 7}M${homeMarker.x} ${homeMarker.y - 7}V${homeMarker.y + 7}`} />
          <text x={homeMarker.x + 8} y={homeMarker.y - 6}>{homeMarker.label}</text>
        </g>
        <g className="iss-tracks" clipPath="url(#world-map-clip)">
          {pastTrackSegments.map((segment, index) => <polyline key={`past-${index}`} className="iss-track past" points={segment.map(([x, y]) => `${x},${y}`).join(" ")} />)}
          {futureTrackSegments.map((segment, index) => <polyline key={`future-${index}`} className="iss-track future" points={segment.map(([x, y]) => `${x},${y}`).join(" ")} />)}
        </g>
        {issPoint && <>
          <circle className="iss-dot" cx={issPoint.x} cy={issPoint.y} r="8" />
          <circle className="iss-pulse" cx={issPoint.x} cy={issPoint.y} r="17" />
        </>}
      </svg>
    </section>
    <div className="legend-lines"><span><i className="track-swatch future" /> trajectoire prévue</span><span><i className="track-swatch past" /> trajectoire passée</span><span><i className="iss-swatch" /> ISS maintenant</span><span><i className="home-swatch" /> nous</span></div>
    <AppNav active="iss" settings={settings} onChange={onTab} />
  </div>;
}

function BoatsPage({ settings, onTab }: { settings: EpaperSettings; onTab: (tab: TabId) => void }) {
  const state = useBoats();
  const [next, ...following] = state.boats;
  const route = state.route ?? { name: "Canal de l'Ourcq", from: "Pantin", home: "Raymond-Queneau", to: "Bobigny", lengthKm: 3.3, homeProgressPercent: 55 };
  const monitoredStart = 23;
  const monitoredEnd = 78;
  const routePosition = (position: number) => monitoredStart + Math.min(100, Math.max(0, position)) / 100 * (monitoredEnd - monitoredStart);
  const homeRoutePosition = routePosition(route.homeProgressPercent);
  const directionLabel = (direction: BoatDirection) => direction === "PARIS" ? "← vers Paris" : direction === "BOBIGNY" ? "vers Bobigny →" : "sens indéterminé";
  const etaLabel = (boat: BoatSummary) => boat.etaMinutes === null ? "—" : `~${boat.etaMinutes} min`;
  const updatedAt = state.updatedAt
    ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(state.updatedAt))
    : "--:--";

  return <div className="boats-page">
    <header className="boats-header"><div><p className="eyebrow">CANAL DE L&apos;OURCQ</p><h1>Bateaux</h1></div><span aria-hidden="true">🚢</span></header>
    <div className="boats-corridor"><span>{route.from}</span><i>•</i><strong>{route.home}</strong><i>•</i><span>{route.to}</span><b>{route.lengthKm.toLocaleString("fr-FR")} km suivis</b></div>
    <section className="boats-live-map" aria-label="Carte live MyShipTracking">
      <header><div><p className="eyebrow">CARTE LIVE</p><strong>MyShipTracking</strong></div><span>Source externe</span></header>
      <iframe
        title="Carte live des bateaux sur le canal de l'Ourcq"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        src="https://embed.myshiptracking.com/embed?myst&zoom=14&lat=48.8946&lng=2.4175&show_menu=0&show_info=1&show_track=1&show_names=1&scroll_wheel=0&map_style=0"
      />
    </section>
    {next ?
      <section className="next-boat" aria-label="Prochain passage">
        <div className="boat-title-line"><div><p className="eyebrow">PROCHAIN PASSAGE</p><h2><span aria-hidden="true">🚢</span>{next.name}</h2></div><span className="boat-type">{next.vesselType ?? "Bateau AIS"}</span></div>
        <p className="boat-direction">{directionLabel(next.direction)} <small>· MMSI {next.mmsi}</small></p>
        <dl className="boat-numbers">
          <div><dt>Distance</dt><dd>{next.distanceKm.toLocaleString("fr-FR")} km</dd></div>
          <div><dt>Passage</dt><dd>{etaLabel(next)}</dd></div>
          <div><dt>Vitesse</dt><dd>{next.speedKmh.toLocaleString("fr-FR")} km/h</dd></div>
          <div><dt>Cap</dt><dd>{next.heading == null ? "—" : `${Math.round(next.heading)}°`}</dd></div>
        </dl>
      </section>
      : <section className="boats-empty"><span aria-hidden="true">AIS</span><div><h2>Aucune position structurée</h2><p>{state.status === "degraded" ? "AISStream ne couvre pas toujours ce tronçon · carte externe affichée" : "Notre API surveille le canal · carte externe en appui"}</p></div></section>}
    <section className="canal-route" aria-label={`Trajet surveillé de ${route.from} à ${route.to}`}>
      <header className="canal-chart-header"><div><p className="eyebrow">CARTE DU CANAL</p><strong>La Villette → Bondy</strong></div><div><span>VUE ÉLARGIE · ~8 KM</span><b>ZONE AIS · {route.lengthKm.toLocaleString("fr-FR")} KM</b></div></header>
      <div className="canal-chart-directions"><b>← PARIS</b><span>COURANT DU CANAL · EST / OUEST</span><b>BONDY →</b></div>
      <div className="canal-chart">
        <div className="canal-water"><i className="canal-watch-zone" style={{ left: `${monitoredStart}%`, width: `${monitoredEnd - monitoredStart}%` }} /></div>
        {next && <span className={`canal-boat canal-boat-${next.direction.toLowerCase()}`} style={{ left: `${routePosition(next.progressPercent ?? 50)}%` }} aria-label={`Position de ${next.name}`}><i>🚢</i><small>{next.distanceKm.toLocaleString("fr-FR")} km</small></span>}
        <i className="canal-home" style={{ left: `${homeRoutePosition}%` }}><u /><em>CHEZ NOUS</em></i>
        <span className="canal-km canal-km-start">0</span><span className="canal-km canal-km-end">8 km</span>
      </div>
      <div className="canal-landmarks" aria-hidden="true">
        <span className="edge" style={{ left: "0%" }}><i />LA VILLETTE<small>BASSIN</small></span>
        <span style={{ left: `${monitoredStart}%` }}><i />PANTIN<small>ZONE AIS</small></span>
        <strong style={{ left: `${homeRoutePosition}%` }}><i />R.-QUENEAU<small>PASSAGE MAISON</small></strong>
        <span style={{ left: `${monitoredEnd}%` }}><i />BOBIGNY<small>PARC BERGÈRE</small></span>
        <span className="edge end" style={{ left: "100%" }}><i />BONDY<small>AMONT</small></span>
      </div>
    </section>
    {next &&
      <section className="following-boats">
        <header><p className="eyebrow">PROCHAINS BATEAUX</p><span>{following.length}</span></header>
        {following.length ? following.slice(0, 4).map((boat) => <article key={boat.id}><div><strong>{boat.name}</strong><small>{boat.vesselType ?? "Bateau AIS"} · {directionLabel(boat.direction)}</small></div><div className="following-boat-data"><b>{etaLabel(boat)}</b><small>{boat.distanceKm.toLocaleString("fr-FR")} km · {boat.speedKmh.toLocaleString("fr-FR")} km/h</small></div></article>) : <p>Aucun autre passage détecté</p>}
      </section>
    }
    <p className="boats-updated">Dernière mise à jour · {updatedAt}</p>
    <AppNav active="boats" settings={settings} onChange={onTab} />
  </div>;
}

function AirPage({ settings, onTab }: { settings: EpaperSettings; onTab: (tab: TabId) => void }) {
  const airTraffic = useAirTraffic();
  const targetAircraft = airTraffic.aircraft;
  const [displayedAircraft, setDisplayedAircraft] = useState<AirTrafficPlane[]>([]);
  const [revealedAt, setRevealedAt] = useState<Record<string, number>>({});
  const [selectedAircraftId, setSelectedAircraftId] = useState("");
  const pendingAircraftRef = useRef<Map<string, AirTrafficPlane>>(new Map());
  const displayedAircraftRef = useRef<AirTrafficPlane[]>([]);
  const radarStartedAt = useRef(0);
  const aircraft = displayedAircraft.length ? displayedAircraft : targetAircraft;
  const selectedAircraft = aircraft.find((plane) => plane.id === selectedAircraftId) ?? aircraft[0];

  useEffect(() => {
    displayedAircraftRef.current = displayedAircraft;
  }, [displayedAircraft]);

  useEffect(() => {
    if (!targetAircraft.length) return;

    const current = displayedAircraftRef.current;
    if (!current.length) {
      const now = Date.now();
      setDisplayedAircraft(targetAircraft);
      setRevealedAt(Object.fromEntries(targetAircraft.map((plane) => [plane.id, now])));
      return;
    }

    const targetIds = new Set(targetAircraft.map((plane) => plane.id));
    targetAircraft.forEach((plane) => {
      const previous = current.find((candidate) => candidate.id === plane.id);
      if (sameAirTrafficPlane(previous, plane)) return;
      pendingAircraftRef.current.set(plane.id, plane);
    });
    for (const id of pendingAircraftRef.current.keys()) {
      if (!targetIds.has(id)) pendingAircraftRef.current.delete(id);
    }
    setDisplayedAircraft((currentVisible) => currentVisible.filter((plane) => targetIds.has(plane.id)));
  }, [targetAircraft]);

  useEffect(() => {
    let animationFrame = 0;
    if (radarStartedAt.current === 0) radarStartedAt.current = Date.now();
    let previousSweepAngle = radarSweepAngle(radarStartedAt.current);

    const revealPendingAircraft = () => {
      const currentSweepAngle = radarSweepAngle(radarStartedAt.current);
      const revealedPlanes: AirTrafficPlane[] = [];

      pendingAircraftRef.current.forEach((plane, id) => {
        if (!didSweepPass(previousSweepAngle, currentSweepAngle, radarBearingFor(plane))) return;
        pendingAircraftRef.current.delete(id);
        revealedPlanes.push(plane);
      });

      if (revealedPlanes.length) {
        const now = Date.now();
        setDisplayedAircraft((visible) => {
          const next = [...visible];
          revealedPlanes.forEach((plane) => {
            const index = next.findIndex((candidate) => candidate.id === plane.id);
            if (index >= 0) next[index] = plane;
            else next.push(plane);
          });
          return next;
        });
        setRevealedAt((currentReveals) => ({
          ...currentReveals,
          ...Object.fromEntries(revealedPlanes.map((plane) => [plane.id, now])),
        }));
      }

      previousSweepAngle = currentSweepAngle;
      animationFrame = window.requestAnimationFrame(revealPendingAircraft);
    };

    animationFrame = window.requestAnimationFrame(revealPendingAircraft);
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  const formatMeters = (value?: number) => typeof value === "number" ? `${new Intl.NumberFormat("fr-FR").format(value)} m` : "--";
  const formatSpeed = (value?: number) => typeof value === "number" ? `${value} km/h` : "--";
  const updatedAt = airTraffic.updatedAt
    ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(airTraffic.updatedAt))
    : "--:--";

  return <div className="air-page">
    <header className="radar-header"><div><p className="eyebrow">TRAFIC AÉRIEN · SIMULATION</p><h1>Air</h1></div><strong>{airTraffic.radiusKm ?? 80} km</strong></header>
    <section className="radar-screen" aria-label="Radar aérien">
      <div className="scan-meta"><span>LFPG/LFPB</span><span>{aircraft.length} cibles</span></div>
      <svg className="local-map" viewBox="-20 -20 140 140" preserveAspectRatio="none" aria-hidden="true">
        <rect className="map-base" x="-20" y="-20" width="140" height="140" />
        <path className="map-water" d="M-20 61C5 58 25 62 47 53S82 41 120 48" />
        <g className="minor-roads">
          <path d="M-18 -16 9 -8 35 2 68 10 118 18" />
          <path d="M-20 -6 12 -3 42 1 75 -2 120 -13" />
          <path d="M-9 120 18 108 44 99 76 92 120 88" />
          <path d="M-20 112 9 109 34 113 66 119 103 121" />
          <path d="M-20 6 2 14 26 28 58 48 120 61" />
          <path d="M-14 104 17 90 42 72 64 56 112 21" />
          <path d="M-20 43 6 41 31 38 55 34 107 14" />
          <path d="M10 14 36 33 58 48 90 56" />
          <path d="M17 90 42 72 64 56 95 31" />
          <path d="M3 41 31 38 55 34 82 18" />
          <path d="M25 5 36 27 48 49 54 76 56 100" />
          <path d="M72 0 68 24 66 45 72 72 82 100" />
          <path d="M0 84 27 81 49 78 100 82" />
          <path d="M6 27 29 30 51 25 98 12" />
          <path d="M-20 25 18 24 47 15 78 8 120 1" />
          <path d="M97 -20 90 17 88 55 94 91 92 120" />
          <path d="M-20 96 18 93 52 88 120 92" />
          <path d="M-20 34 5 32 24 35 47 43 69 52 120 57" />
          <path d="M-20 72 7 68 31 70 58 78 82 83 120 80" />
          <path d="M-8 -20 2 8 14 36 25 66 33 97 40 120" />
          <path d="M14 -20 22 9 31 34 38 61 44 91 45 120" />
          <path d="M60 -20 58 8 62 31 67 55 67 88 63 120" />
          <path d="M111 -20 104 8 100 35 102 63 110 91 116 120" />
        </g>
        <g className="road-casings">
          <path d="M-20 -10C10 -8 31 -14 55 -7S88 2 120 -1" />
          <path d="M-20 108C7 103 29 103 51 107S88 116 120 113" />
          <path d="M43 -20C42 3 43 25 50 49S53 84 49 120" />
          <path d="M-20 21C6 22 25 19 47 15S82 10 120 6" />
          <path d="M82 -20C80 7 83 35 88 55S96 90 92 120" />
        </g>
        <g className="major-roads">
          <path d="M-20 -10C10 -8 31 -14 55 -7S88 2 120 -1" />
          <path d="M-20 108C7 103 29 103 51 107S88 116 120 113" />
          <path d="M43 -20C42 3 43 25 50 49S53 84 49 120" />
          <path d="M-20 21C6 22 25 19 47 15S82 10 120 6" />
          <path d="M82 -20C80 7 83 35 88 55S96 90 92 120" />
        </g>
        <path className="map-ring" d="M-6 55C-2 24 23 1 54-2S112 19 115 52 91 112 55 113-10 91-6 55Z" />
        <path className="local-road rail" d="M23 16 49 48 82 88" />
        <g className="district-labels">
          <text x="-5" y="9">SAINT-DENIS</text>
          <text x="8" y="26">PARIS</text>
          <text x="24" y="12">AUBERVILLIERS</text>
          <text x="32" y="47">PANTIN</text>
          <text x="55" y="20">BOBIGNY</text>
          <text x="70" y="36">BONDY</text>
          <text x="69" y="82">BAGNOLET</text>
          <text x="12" y="82">LES LILAS</text>
          <text x="57" y="59">ROMAINVILLE</text>
          <text x="89" y="14">CDG</text>
          <text x="95" y="96">ORLY</text>
          <text x="93" y="47">ROSNY</text>
          <text x="75" y="68">NOISY</text>
          <text x="0" y="-7">LE BOURGET</text>
          <text x="55" y="-8">GONESSE</text>
          <text x="-4" y="111">MONTREUIL</text>
          <text x="58" y="108">VINCENNES</text>
        </g>
        <g className="road-labels">
          <text x="45" y="32" transform="rotate(82 45 32)">D 115</text>
          <text x="77" y="17" transform="rotate(-7 77 17)">A 3</text>
          <text x="73" y="54" transform="rotate(-12 73 54)">CANAL DE L’OURCQ</text>
        </g>
        <g className="tower-marker" transform="translate(54 64)">
          <circle r="3" />
          <path d="M0 -2.2V2.2M-1.6 2.2H1.6M-1.1 .9 0 -.9 1.1 .9M-2 -1.3C-.9 -2.5 .9 -2.5 2 -1.3M-2.6 -2.1C-1.1 -3.6 1.1 -3.6 2.6 -2.1" />
        </g>
      </svg>
      <span className="axis north">N</span><span className="axis east">E</span><span className="axis south">S</span><span className="axis west">W</span>
      <span className="gps-dot" aria-label="Notre position"><i /></span>
      <span className="radar-sweep" aria-hidden="true" />
      {aircraft.map((plane) => <button
        className={`plane-target${selectedAircraft?.id === plane.id ? " selected" : ""}`}
        key={plane.id}
        onClick={() => setSelectedAircraftId(plane.id)}
        style={{ left: `${plane.x / 255 * 100}%`, top: `${plane.y / 255 * 100}%`, "--heading": `${plane.heading}deg` } as CSSProperties}
        aria-label={`${plane.id}, ${plane.airline}, ${formatMeters(plane.altitudeM)}, à ${plane.distanceKm} km`}
      >
        <span className="plane-halo" key={revealedAt[plane.id] ?? 0} aria-hidden="true" />
        <span className="plane-vector" aria-hidden="true"><i className="plane-trail" /><i className="plane-symbol" /></span>
        <span className="plane-label"><b>{plane.id}</b><small>{plane.flightLevel}</small></span>
      </button>)}
    </section>
    {selectedAircraft && <section className="air-details" aria-live="polite" aria-label="Détails de l'avion sélectionné">
      <header><div><strong>{selectedAircraft.id}</strong><span>{selectedAircraft.tailNumber}</span></div><b>{selectedAircraft.bearing} · {selectedAircraft.distanceKm} km</b></header>
      <p>{selectedAircraft.airline} · {selectedAircraft.aircraftType} · {selectedAircraft.route}</p>
      <dl><div><dt>Altitude</dt><dd>{formatMeters(selectedAircraft.altitudeM)}</dd></div><div><dt>Vitesse</dt><dd>{formatSpeed(selectedAircraft.speedKmh)}</dd></div></dl>
    </section>}
    <p className={`radar-status ${airTraffic.status}`}><span /> Simulation · sync {updatedAt}</p>
    <section className="aircraft-list" aria-label="Avions détectés">
      <header><p className="eyebrow">Avions détectés</p><span>{aircraft.length}</span></header>
      {aircraft.map((plane) => <button
        key={plane.id}
        className={selectedAircraft?.id === plane.id ? "selected" : ""}
        onClick={() => setSelectedAircraftId(plane.id)}
        aria-pressed={selectedAircraft?.id === plane.id}
      >
        <span><strong>{plane.id}</strong><small>{plane.registration} · {plane.airline}</small></span>
        <span><b>{plane.distanceKm} km</b><small>{formatMeters(plane.altitudeM)} · {formatSpeed(plane.speedKmh)}</small></span>
      </button>)}
    </section>
    <AppNav active="air" settings={settings} onChange={onTab} />
  </div>;
}

function SettingsPage({ settings, onSettings, onTab }: { settings: EpaperSettings; onSettings: (settings: EpaperSettings) => void; onTab: (tab: TabId) => void }) {
  const toggleVisible = (tab: TabId) => {
    if (!tabCatalog.find((entry) => entry.id === tab)?.epaper) return;
    const visibleTabs = settings.visibleTabs.includes(tab)
      ? settings.visibleTabs.filter((entry) => entry !== tab)
      : [...settings.visibleTabs, tab].slice(0, MAX_EPAPER_TABS);
    onSettings({ ...settings, visibleTabs: visibleTabs.length ? visibleTabs : ["lists"], activeTab: visibleTabs.includes(settings.activeTab) ? settings.activeTab : visibleTabs[0] ?? "lists" });
  };

  return <div className="settings-page">
    <header className="settings-header"><div><p className="eyebrow">ÉCRAN E-PAPER</p><h1>Réglages</h1></div><span>{settings.visibleTabs.length}/{MAX_EPAPER_TABS}</span></header>
    <section className="settings-section">
      <p className="eyebrow">Onglets visibles</p>
      <div className="tab-picker">
        {epaperTabs.map((tab) => <button key={tab.id} className={settings.visibleTabs.includes(tab.id) ? "selected" : ""} onClick={() => toggleVisible(tab.id)} aria-pressed={settings.visibleTabs.includes(tab.id)}>
          <span>{tab.icon}</span><strong>{tab.label}</strong>
        </button>)}
      </div>
    </section>
    <section className="settings-section two">
      <label><span>Onglet affiché</span><select value={settings.activeTab} onChange={(event) => onSettings({ ...settings, activeTab: event.target.value as TabId })}>{epaperTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}</select></label>
      <label><span>Carrousel</span><button className={settings.carouselEnabled ? "selected setting-toggle" : "setting-toggle"} onClick={() => onSettings({ ...settings, carouselEnabled: !settings.carouselEnabled })}>{settings.carouselEnabled ? "Activé" : "Arrêté"}</button></label>
      <label><span>Délai</span><input type="number" min="30" step="30" value={settings.carouselIntervalSeconds} onChange={(event) => onSettings({ ...settings, carouselIntervalSeconds: Number(event.target.value) || 120 })} /></label>
    </section>
    <section className="settings-preview">
      <p className="eyebrow">Version {APP_VERSION}</p>
      <code>{JSON.stringify({ visibleTabs: settings.visibleTabs.map(epaperKeyFor), activeTab: epaperKeyFor(settings.activeTab), carousel: { enabled: settings.carouselEnabled, intervalSeconds: settings.carouselIntervalSeconds } }, null, 2)}</code>
    </section>
    <button className="back-to-screen" onClick={() => onTab(settings.activeTab)}>Retour à l&apos;écran</button>
  </div>;
}

function AccessGate({ onAuthorized }: { onAuthorized: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) { setError(response.status === 429 ? "Trop de tentatives : attendez une minute" : response.status === 503 ? "Connexion temporairement indisponible" : "Code incorrect"); return; }
    onAuthorized();
  }

  return <main className="access-stage"><section className="access-panel">
    <p className="eyebrow">SUPERVIE</p><h1>Accès partagé</h1>
    <form onSubmit={submit}><label htmlFor="access-code">Code d’accès</label><input id="access-code" type="password" value={code} onChange={(event) => setCode(event.target.value)} autoFocus /><button type="submit">Entrer</button></form>
    {error && <p className="access-error" role="alert">{error}</p>}
  </section></main>;
}

export default function Home() {
  const [lists, setLists] = useState(initialLists);
  const [currentListId, setCurrentListId] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showLists, setShowLists] = useState(false);
  const [showFullList, setShowFullList] = useState(false);
  const modalOpener = useRef<HTMLElement | null>(null);
  const closeDialogs = useCallback(() => { setShowAdd(false); setShowLists(false); }, []);
  useModalKeyboard(showAdd || showLists, closeDialogs, modalOpener);
  const [newItemsText, setNewItemsText] = useState("");
  const [newListName, setNewListName] = useState("");
  const [syncState, setSyncState] = useState<"loading" | "synced" | "error">("loading");
  const [mutationNotice, setMutationNotice] = useState("");
  const [view, setView] = useState<TabId>("lists");
  const [epaperSettings, setEpaperSettings] = useState<EpaperSettings>(defaultEpaperSettings);
  const [access, setAccess] = useState<"checking" | "denied" | "granted">("checking");
  const listRevision = useRef(0);
  const settingsRevision = useRef(0);
  const settingsQueue = useRef(new SerializedMutationQueue());
  const settingsPending = useRef(0);
  // React may not re-render between two physical taps. Keep the intended
  // checkbox state separately so rapid taps still enqueue alternating writes.
  const pendingChecked = useRef(new Map<number, boolean>());
  const pendingMutations = useRef<PendingListMutation[]>([]);
  const retryTimers = useRef(new Map<string, number>());
  const mutateRef = useRef<((action: Record<string, unknown>, resumed?: PendingListMutation) => Promise<ShoppingList[] | null>) | null>(null);
  const mutationInFlight = useRef(0);
  const mutationQueue = useRef(new SerializedMutationQueue());

  useEffect(() => {
    const requestedTab = tabFromQuery();
    const saved = window.localStorage.getItem("supervie-epaper-settings");
    if (!saved) {
      if (requestedTab) {
        // The query parameter is an external navigation input synchronized on
        // mount; it must be reflected in the local preview.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEpaperSettings((current) => ({ ...current, activeTab: requestedTab }));
        setView(requestedTab);
      }
      return;
    }
    try {
      const parsed = JSON.parse(saved) as Partial<EpaperSettings>;
      const visibleTabs = Array.isArray(parsed.visibleTabs)
        ? parsed.visibleTabs.filter((tab): tab is TabId => epaperTabs.some((entry) => entry.id === tab)).slice(0, MAX_EPAPER_TABS)
        : defaultEpaperSettings.visibleTabs;
      const migratedTabs = parsed.configVersion === defaultEpaperSettings.configVersion
        ? visibleTabs
        : defaultEpaperSettings.visibleTabs.reduce<TabId[]>((tabs, tab) => (
          tabs.includes(tab) || tabs.length >= MAX_EPAPER_TABS ? tabs : [...tabs, tab]
        ), visibleTabs).slice(0, MAX_EPAPER_TABS);
      const savedActiveTab = epaperTabs.some((entry) => entry.id === parsed.activeTab) ? parsed.activeTab as TabId : defaultEpaperSettings.activeTab;
      const activeTab = requestedTab ?? savedActiveTab;
      setEpaperSettings({
        visibleTabs: migratedTabs.length ? migratedTabs : defaultEpaperSettings.visibleTabs,
        activeTab: migratedTabs.includes(activeTab) ? activeTab : "agenda",
        carouselEnabled: Boolean(parsed.carouselEnabled),
        carouselIntervalSeconds: Math.max(30, Number(parsed.carouselIntervalSeconds) || defaultEpaperSettings.carouselIntervalSeconds),
        configVersion: defaultEpaperSettings.configVersion,
      });
      setView(migratedTabs.includes(activeTab) ? activeTab : "agenda");
    } catch {
      window.localStorage.removeItem("supervie-epaper-settings");
      if (requestedTab) setView(requestedTab);
    }
  }, []);

  const updateEpaperSettings = useCallback((next: EpaperSettings) => {
    const normalized: EpaperSettings = {
      ...next,
      activeTab: epaperTabs.some((tab) => tab.id === next.activeTab) ? next.activeTab : "lists",
      visibleTabs: next.visibleTabs
        .filter((tab) => epaperTabs.some((entry) => entry.id === tab))
        .filter((tab, index, all) => all.indexOf(tab) === index)
        .slice(0, MAX_EPAPER_TABS),
      carouselIntervalSeconds: Math.max(30, Number(next.carouselIntervalSeconds) || 120),
      configVersion: defaultEpaperSettings.configVersion,
    };
    if (!normalized.visibleTabs.length) normalized.visibleTabs = ["lists"];
    if (!normalized.visibleTabs.includes(normalized.activeTab)) normalized.activeTab = normalized.visibleTabs[0] ?? "lists";
    settingsRevision.current += 1;
    setEpaperSettings(normalized);
    window.localStorage.setItem("supervie-epaper-settings", JSON.stringify(normalized));
    const before = epaperSettings;
    const patch: Record<string, unknown> = {};
    if (normalized.activeTab !== before.activeTab) Object.assign(patch, { activeTab: epaperKeyFor(normalized.activeTab), preferredTab: epaperKeyFor(normalized.activeTab) });
    if (JSON.stringify(normalized.visibleTabs) !== JSON.stringify(before.visibleTabs)) patch.visibleTabs = normalized.visibleTabs.map(epaperKeyFor);
    const carousel: Record<string, unknown> = {};
    if (normalized.carouselEnabled !== before.carouselEnabled) carousel.enabled = normalized.carouselEnabled;
    if (normalized.carouselIntervalSeconds !== before.carouselIntervalSeconds) carousel.intervalSeconds = normalized.carouselIntervalSeconds;
    if (Object.keys(carousel).length) patch.carousel = carousel;
    settingsPending.current += 1;
    void settingsQueue.current.enqueue(async () => {
      try {
        const current = await fetch("/api/epaper-settings", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (!current.ok) throw new Error("Lecture des réglages impossible");
        const latest = await current.json() as { revision: number };
        const response = await fetch("/api/epaper-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...patch, revision: latest.revision }), signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(response.status === 409 ? "Réglages modifiés ailleurs : réessayez" : "Réglages non enregistrés : réessayez");
      } catch (error) { setMutationNotice(error instanceof Error ? error.message : "Réglages non enregistrés"); }
      finally { settingsPending.current -= 1; }
    });
    setView(normalized.activeTab);
  }, [epaperSettings]);

  const setVisibleView = useCallback((tab: TabId) => {
    if (tab === "settings") {
      setView(tab);
      return;
    }
    updateEpaperSettings({ ...epaperSettings, activeTab: tab });
  }, [epaperSettings, updateEpaperSettings]);

  useEffect(() => {
    void fetch("/api/access", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ authorized?: boolean }>)
      .then((data) => setAccess(data.authorized ? "granted" : "denied"))
      .catch(() => setAccess("denied"));
  }, []);

  const loadLists = useCallback(async (quiet = false) => {
    if (mutationInFlight.current > 0) return;
    const requestRevision = listRevision.current;
    if (!quiet) setSyncState("loading");
    try {
      const response = await fetch("/api/lists", { cache: "no-store" });
      if (!response.ok) throw new Error("sync");
      const data = await response.json() as { lists: ShoppingList[] };
      if (requestRevision !== listRevision.current || mutationInFlight.current > 0) return;
      setLists(data.lists);
      setCurrentListId((current) => data.lists.some((list) => list.id === current) ? current : data.lists[0]?.id ?? 0);
      setSyncState("synced");
    } catch { setSyncState("error"); }
  }, []);

  useEffect(() => {
    if (access !== "granted") return;
    const initialTimer = window.setTimeout(() => loadLists(), 0);
    const timer = window.setInterval(() => loadLists(true), 5000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [access, loadLists]);

  useEffect(() => {
    if (access !== "granted") return;
    let active = true;
    const loadSettings = async () => {
      const requestRevision = settingsRevision.current;
      try {
        const response = await fetch("/api/epaper-settings", { cache: "no-store" });
        if (!response.ok) return;
        const next = localEpaperSettings(await response.json());
        if (!active || settingsPending.current > 0 || !next || !isCurrentSettingsResponse(requestRevision, settingsRevision.current)) return;
        setEpaperSettings(next);
        window.localStorage.setItem("supervie-epaper-settings", JSON.stringify(next));
      } catch {
        // The local cached settings remain usable when the network is down.
      }
    };
    void loadSettings();
    const timer = window.setInterval(loadSettings, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [access]);

  const cancelScheduledRetry = useCallback((mutationId: string) => {
    const timer = retryTimers.current.get(mutationId);
    if (timer !== undefined) window.clearTimeout(timer);
    retryTimers.current.delete(mutationId);
  }, []);

  const scheduleRetry = useCallback((entry: PendingListMutation) => {
    cancelScheduledRetry(entry.id);
    const expiresAt = entry.createdAt + PENDING_LIST_MUTATION_TTL_MS;
    const nextAttemptAt = entry.nextAttemptAt ?? currentTimestamp();
    if (entry.status !== "rate_limited" || (entry.retryCount ?? 0) >= 3 || nextAttemptAt > expiresAt) return;
    const timer = window.setTimeout(() => {
      retryTimers.current.delete(entry.id);
      const current = pendingMutations.current.find((candidate) => candidate.id === entry.id);
      if (!current || current.status !== "rate_limited" || (current.retryCount ?? 0) >= 3 || (current.nextAttemptAt ?? 0) > currentTimestamp()) return;
      void mutateRef.current?.(current.action, current);
    }, Math.max(0, nextAttemptAt - currentTimestamp()));
    retryTimers.current.set(entry.id, timer);
  }, [cancelScheduledRetry]);

  useEffect(() => () => {
    for (const timer of retryTimers.current.values()) window.clearTimeout(timer);
    retryTimers.current.clear();
  }, []);

  const updatePendingJournal = useCallback(async (update: (entries: PendingListMutation[]) => PendingListMutation[]) => {
    const next = await updatePendingListMutations(window.localStorage, update);
    pendingMutations.current = next;
    return next;
  }, []);

  const mutate = useCallback(async (action: Record<string, unknown>, resumed?: PendingListMutation) => {
    // Serialize writes instead of dropping an action made while a slow request
    // is in flight.  Each caller still receives the result of its own write.
    if (!supportsPendingMutationLocks()) {
      setSyncState("error"); setMutationNotice("Reprise multi-onglets indisponible : action non envoyée"); return null;
    }
    // Identical payloads can represent distinct taps (for example, two
    // intentionally identical additions). Only a persisted operation being
    // resumed is allowed to reuse its idempotency key.
    const mutationId = resumed?.id ?? crypto.randomUUID();
    if (!resumed) {
      const entry: PendingListMutation = { id: mutationId, action, createdAt: currentTimestamp(), status: "pending" };
      try { await updatePendingJournal((entries) => [...entries.filter((candidate) => candidate.id !== mutationId), entry]); }
      catch { setSyncState("error"); setMutationNotice("Enregistrement local indisponible : action non envoyée"); return null; }
    }
    mutationInFlight.current += 1;
    listRevision.current += 1;
    setSyncState("loading");
    const perform = async () => {
      try {
        const persisted = loadPendingListMutations(window.localStorage).find((entry) => entry.id === mutationId);
        if (!persisted) return null;
        if (persisted.status === "rejected" || (!resumed && persisted.status === "auth_required") || (persisted.status === "rate_limited" && ((persisted.retryCount ?? 0) >= 3 || (persisted.nextAttemptAt ?? 0) > currentTimestamp()))) return null;
        let response: Response | null = null;
        // If the server committed but the response was lost, repeat the same
        // idempotent action once. A different action always gets a new key.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            response = await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json", "x-supervie-mutation-id": mutationId }, body: JSON.stringify(persisted.action), signal: AbortSignal.timeout(15_000) });
            if (response.status !== 409 || attempt === 1) break;
          } catch {
            if (attempt === 1) throw new Error("sync");
          }
        }
        if (!response) throw new Error("sync");
        if (!response.ok) {
          const responseError = await response.clone().json().catch(() => null) as { error?: unknown } | null;
          const contentConflict = response.status === 409 && typeof responseError?.error === "string" && responseError.error.includes("autre contenu");
          if (response.status === 401) {
            await updatePendingJournal((entries) => entries.map((entry) => entry.id === mutationId ? { ...entry, status: "auth_required", error: "Connexion requise" } : entry)); setAccess("denied"); setMutationNotice("Action en attente de reconnexion"); throw new Error("auth");
          }
          if (response.status === 429) {
            const retryAfter = response.headers.get("retry-after"); const seconds = retryAfter ? Number(retryAfter) : NaN; const date = retryAfter ? Date.parse(retryAfter) : NaN;
            const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Number.isFinite(date) && date > Date.now() ? date - Date.now() : 5_000;
            const current = loadPendingListMutations(window.localStorage).find((entry) => entry.id === mutationId); const retryCount = (current?.retryCount ?? 0) + (resumed ? 1 : 0);
            const retryEntry = current && { ...current, status: "rate_limited" as const, nextAttemptAt: Date.now() + delay, retryCount, error: retryCount >= 3 ? "Limitation persistante — réessayez plus tard" : "Limitation temporaire" };
            await updatePendingJournal((entries) => entries.map((entry) => entry.id === mutationId && retryEntry ? retryEntry : entry)); setMutationNotice(retryCount >= 3 ? "Action en attente de votre confirmation" : "Action reportée temporairement");
            if (retryEntry) scheduleRetry(retryEntry);
            throw new Error("rate");
          }
          if ((response.status >= 400 && response.status < 500 && response.status !== 409) || contentConflict) {
            const error = typeof responseError?.error === "string" ? responseError.error : "Action refusée";
            try { await updatePendingJournal((entries) => entries.map((entry) => entry.id === mutationId ? { ...entry, status: "rejected", error } : entry)); } catch {}
            setSyncState("error"); setMutationNotice(`Action non appliquée : ${error}`);
            return null;
          }
          throw new Error("sync");
        }
        const data = await response.json() as { lists: ShoppingList[] };
        cancelScheduledRetry(mutationId);
        try { await updatePendingJournal((entries) => entries.filter((entry) => entry.id !== mutationId)); } catch { setSyncState("error"); }
        setLists(data.lists); setSyncState("synced"); return data.lists;
      } catch (error) {
        if (!(error instanceof Error) || (error.message !== "rate" && error.message !== "auth")) try { await updatePendingJournal((entries) => entries.map((entry) => entry.id === mutationId ? { ...entry, status: "uncertain" } : entry)); } catch {}
        setSyncState("error"); return null;
      }
      finally { mutationInFlight.current -= 1; }
    };
    return mutationQueue.current.enqueue(() => withPendingListMutationLock(mutationId, perform));
  }, [cancelScheduledRetry, scheduleRetry, updatePendingJournal]);

  useEffect(() => {
    mutateRef.current = mutate;
  }, [mutate]);

  useEffect(() => {
    if (access !== "granted") return;
    let loaded;
    try { loaded = readPendingListMutations(window.localStorage); pendingMutations.current = loaded.entries; }
    catch { queueMicrotask(() => { setSyncState("error"); setMutationNotice("Journal local indisponible : aucune reprise automatique"); }); return; }
    const expired = loaded.expired.find((entry) => entry.status === "uncertain" || entry.status === "pending");
    if (expired) queueMicrotask(() => setMutationNotice(`Action expirée : résultat inconnu pour ${JSON.stringify(expired.action)}. Vérifiez la liste avant de décider de la refaire.`));
    const rejected = pendingMutations.current.find((entry) => entry.status === "rejected");
    if (rejected) queueMicrotask(() => setMutationNotice(`Action non appliquée : ${rejected.error ?? "Action refusée"}`));
    for (const entry of pendingMutations.current) {
      if (entry.status === "rejected") continue;
      if (entry.status === "rate_limited" && (entry.retryCount ?? 0) >= 3) continue;
      if (entry.status === "rate_limited" && (entry.nextAttemptAt ?? 0) > Date.now()) {
        scheduleRetry(entry);
        continue;
      }
      void mutateRef.current?.(entry.action, entry);
    }
  }, [access, scheduleRetry]);

  useEffect(() => {
    if (access !== "granted") return;
    if (!supportsPendingMutationLocks()) {
      queueMicrotask(() => setMutationNotice("Ce navigateur ne coordonne pas les reprises entre onglets"));
      return;
    }
    const synchronize = () => {
      try { pendingMutations.current = readPendingListMutations(window.localStorage).entries; }
      catch { setSyncState("error"); setMutationNotice("Journal local indisponible : aucune reprise automatique"); return; }
      for (const entry of pendingMutations.current) {
        if (entry.status === "rejected") {
          setMutationNotice(`Action non appliquée : ${entry.error ?? "Action refusée"}`);
        } else if (entry.status === "rate_limited") {
          if ((entry.retryCount ?? 0) < 3 && (entry.nextAttemptAt ?? 0) > currentTimestamp()) scheduleRetry(entry);
        } else if (entry.status !== "auth_required") {
          void mutateRef.current?.(entry.action, entry);
        }
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && event.key === "supervie-pending-list-mutations") synchronize();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [access, scheduleRetry]);

  const currentList = lists.find((list) => list.id === currentListId) ?? lists[0];
  const items = currentList?.items ?? [];
  const remaining = items.filter((item) => !item.checked).length;

  async function toggle(id: number) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    const checked = pendingChecked.current.get(id) ?? item.checked;
    const nextChecked = !checked;
    pendingChecked.current.set(id, nextChecked);
    setLists((current) => current.map((list) => ({
      ...list,
      items: list.items.map((entry) => entry.id === id ? { ...entry, checked: nextChecked } : entry),
    })));
    const updated = await mutate({ action: "toggleItem", id, checked: nextChecked });
    if (updated && pendingChecked.current.get(id) === nextChecked) {
      pendingChecked.current.delete(id);
    } else if (!updated) {
      pendingChecked.current.delete(id);
      void loadLists(true);
    }
  }

  async function addItems(event: FormEvent) {
    event.preventDefault();
    const labels = newItemsText
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*•▪◦]|\d+[.)]|\[[ xX]?\])\s*/, "").trim())
      .filter(Boolean);
    if (labels.length === 0) return;
    const updated = await mutate({ action: "addItems", listId: currentListId, labels });
    if (updated) {
      setNewItemsText("");
      setShowAdd(false);
    }
  }

  async function clearChecked() {
    await mutate({ action: "clearChecked", listId: currentListId });
  }

  async function deleteItem(id: number) {
    const item = items.find((entry) => entry.id === id);
    if (!item || !window.confirm(`Supprimer « ${item.label} » de cette liste ?`)) return;
    await mutate({ action: "deleteItem", id });
  }

  async function createList(event: FormEvent) {
    event.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    const updated = await mutate({ action: "createList", name });
    if (updated?.length) setCurrentListId(updated[updated.length - 1].id);
    setNewListName("");
    setShowLists(false);
  }

  async function renameList(id: number) {
    const list = lists.find((entry) => entry.id === id);
    const name = window.prompt("Nouveau nom de la liste :", list?.name)?.trim();
    if (name) await mutate({ action: "renameList", id, name });
  }

  async function deleteList(id: number) {
    if (lists.length === 1) return;
    const list = lists.find((entry) => entry.id === id);
    if (!window.confirm(`Supprimer la liste « ${list?.name} » ?`)) return;
    const updated = await mutate({ action: "deleteList", id });
    if (currentListId === id && updated?.length) setCurrentListId(updated[0].id);
  }

  if (access !== "granted") return <AccessGate onAuthorized={() => setAccess("granted")} />;

  return (
    <main className="stage">
      <section className="device" aria-label="Aperçu de l'écran SUPERVIE">
        {mutationNotice.startsWith("Réglages") && <p role="alert" className="access-error">{mutationNotice}</p>}
        {view !== "settings" && <button className="site-settings-button" onClick={() => setView("settings")} aria-label="Réglages du site et de l'écran">⚙</button>}
        {view === "creche" ? <CrechePage settings={epaperSettings} onTab={setVisibleView} /> : view === "meteo" ? <MeteoPage settings={epaperSettings} onTab={setVisibleView} /> : view === "meals" ? <MealPlannerPage settings={epaperSettings} onTab={setVisibleView} /> : view === "metro" ? <MetroPage settings={epaperSettings} onTab={setVisibleView} /> : view === "agenda" ? <AgendaPage settings={epaperSettings} onTab={setVisibleView} /> : view === "settings" ? <SettingsPage settings={epaperSettings} onSettings={updateEpaperSettings} onTab={setVisibleView} /> : view === "iss" ? <IssPage settings={epaperSettings} onTab={setVisibleView} /> : view === "air" ? <AirPage settings={epaperSettings} onTab={setVisibleView} /> : view === "boats" ? <BoatsPage settings={epaperSettings} onTab={setVisibleView} /> : <>
        <header className="topbar">
          <div>
            <p className="eyebrow">SUPERVIE · LISTE PARTAGÉE</p>
            <h1>{currentList?.name}</h1>
          </div>
          <button className="list-switch" onClick={(event) => { modalOpener.current = event.currentTarget; setShowLists(true); }} aria-label="Afficher toutes les listes">
            <span aria-hidden="true">☰</span>
            Toutes les listes
          </button>
        </header>

        <div className="summary">
          <div>
            <strong>{remaining}</strong>
            <span>{remaining > 1 ? "articles à acheter" : "article à acheter"}</span>
          </div>
          <button className="full-list-button" onClick={() => setShowFullList(true)}>
            Voir la liste entière
          </button>
        </div>

        <ul className="shopping-list" aria-label="Articles">
          {items.map((item) => (
            <li key={item.id} className={item.checked ? "checked" : ""}>
              <div className="item-row">
                <button
                  className="item-button"
                  onClick={() => toggle(item.id)}
                  aria-pressed={item.checked}
                  aria-label={`${item.checked ? "Décocher" : "Cocher"} ${item.label}`}
                >
                  <span className="checkbox" aria-hidden="true">
                    {item.checked ? "✓" : ""}
                  </span>
                  <span className="item-emoji" aria-hidden="true">{emojiFor(item.label)}</span>
                  <span className="item-label">{item.label}</span>
                </button>
                <button className="delete-item" onClick={() => deleteItem(item.id)} aria-label={`Supprimer ${item.label}`}>×</button>
              </div>
            </li>
          ))}
        </ul>

        <footer className="controls">
          <div className="quick-actions">
            <button className="primary-action" onClick={(event) => { modalOpener.current = event.currentTarget; setShowAdd(true); }}>+ Ajouter un article</button>
            <button onClick={clearChecked}>Effacer cochés</button>
          </div>
          <p className={`sync-line ${syncState}`}><span /> {mutationNotice || (syncState === "loading" ? "Synchronisation…" : syncState === "error" ? "Hors connexion — réessayer" : "Synchronisé")}</p>
          <AppNav active="lists" settings={epaperSettings} onChange={setVisibleView} />
        </footer>

        {showAdd && (
          <div className="overlay" role="dialog" aria-modal="true" aria-label="Ajouter un article">
            <form className="panel" onSubmit={addItems}>
              <p className="eyebrow">AJOUTER DES ARTICLES</p>
              <label htmlFor="new-items">Colle une entrée par ligne</label>
              <textarea
                id="new-items"
                value={newItemsText}
                onChange={(event) => setNewItemsText(event.target.value)}
                autoFocus
                placeholder={"Tomates\nLait\nCouches"}
              />
              {mutationNotice.startsWith("Action non appliquée") && <p role="alert" className="access-error">{mutationNotice}</p>}
              {(mutationNotice.startsWith("Action reportée") || mutationNotice.startsWith("Action en attente")) && <p role="status" className="access-error">{mutationNotice}</p>}
              {(mutationNotice.startsWith("Enregistrement local indisponible") || mutationNotice.startsWith("Reprise multi-onglets indisponible")) && <p role="alert" className="access-error">{mutationNotice}</p>}
              <div className="panel-actions">
                <button type="button" onClick={() => setShowAdd(false)}>Annuler</button>
                <button type="submit" className="inverted">Ajouter la liste</button>
              </div>
            </form>
          </div>
        )}

        {showLists && (
          <div className="list-manager" role="dialog" aria-modal="true" aria-label="Gérer les listes">
            <header className="manager-header">
              <div><p className="eyebrow">MES LISTES</p><h2>Choisir une liste</h2></div>
              <button onClick={() => setShowLists(false)} aria-label="Fermer">×</button>
            </header>
            <div className="list-choices">
              {lists.map((list) => {
                const count = list.items.filter((item) => !item.checked).length;
                return (
                  <div className={`list-choice ${list.id === currentListId ? "active" : ""}`} key={list.id}>
                    <button className="choose-list" onClick={() => { setCurrentListId(list.id); setShowLists(false); }}>
                      <span>{list.name}</span><small>{count} à acheter</small>
                    </button>
                    <button className="list-tool" onClick={() => renameList(list.id)} aria-label={`Renommer ${list.name}`}>✎</button>
                    <button className="list-tool" disabled={lists.length === 1} onClick={() => deleteList(list.id)} aria-label={`Supprimer ${list.name}`}>×</button>
                  </div>
                );
              })}
            </div>
            <form className="new-list-form" onSubmit={createList}>
              <label htmlFor="new-list">Créer une liste</label>
              <div><input id="new-list" value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="Ex. Marché" /><button type="submit" className="inverted">+</button></div>
            </form>
          </div>
        )}

        {showFullList && (
          <section className="full-list-screen" aria-label={`Liste entière ${currentList?.name}`}>
            <header className="full-list-header">
              <div>
                <p className="eyebrow">SUPERVIE · LISTE COMPLÈTE</p>
                <h2>{currentList?.name}</h2>
                <p>{remaining} {remaining > 1 ? "articles à acheter" : "article à acheter"}</p>
              </div>
              <button onClick={() => setShowFullList(false)} aria-label="Fermer la liste entière">×</button>
            </header>
            <ul className={`full-shopping-list ${items.length > 14 ? "very-dense" : items.length > 10 ? "dense" : ""}`} aria-label="Tous les articles">
              {items.map((item) => (
                <li key={item.id} className={item.checked ? "checked" : ""}>
                  <div className="item-row">
                    <button
                      className="item-button"
                      onClick={() => toggle(item.id)}
                      aria-pressed={item.checked}
                      aria-label={`${item.checked ? "Décocher" : "Cocher"} ${item.label}`}
                    >
                      <span className="checkbox" aria-hidden="true">{item.checked ? "✓" : ""}</span>
                      <span className="item-emoji" aria-hidden="true">{emojiFor(item.label)}</span>
                      <span className="item-label">{item.label}</span>
                    </button>
                    <button className="delete-item" onClick={() => deleteItem(item.id)} aria-label={`Supprimer ${item.label}`}>×</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        </>}
      </section>
      <p className="prototype-note">Prototype portrait · LILYGO T5 4,7″ · 540 × 960</p>
    </main>
  );
}
