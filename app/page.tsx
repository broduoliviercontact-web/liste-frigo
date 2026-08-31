"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Item = { id: number; label: string; checked: boolean };
type ShoppingList = { id: number; name: string; items: Item[] };
type Meal = { id: number; date: string; moment: "midi" | "soir"; label: string };
type EpaperWeather = {
  status: "ready" | "unavailable";
  location: string;
  updatedAt?: string;
  current?: { time: string; temperature: number; weatherCode: number; isDay: boolean };
  today?: { min: number; max: number; weatherCode: number };
  tomorrow?: { date: string; min: number; max: number; weatherCode: number };
  hourly?: Array<{ time: string; temperature: number; weatherCode: number; isDay: boolean }>;
};

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

function CrechePage({ onLists, onWeather, onMeals }: { onLists: () => void; onWeather: () => void; onMeals: () => void }) {
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
        <div className="baby-avatar"><img src={weather.image} alt={`César habillé pour un temps ${weather.label.toLowerCase()}, avec son doudou girafe`} /></div>
        <ul>{weather.clothes.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
    </section>
    <section className="evening-card">
      <div><p className="eyebrow">RETOUR · 17H</p><strong>{returnTemperature}</strong></div>
      <div className="sun-advice"><span>{weatherIcon(returnHour?.weatherCode ?? liveWeather?.today?.weatherCode, true)}</span><p><strong>{weather.feeling}</strong><br />{weather.advice}</p></div>
    </section>
    <p className="weather-update"><span /> {liveWeather?.status === "ready" ? "Météo synchronisée" : "Météo indisponible"}</p>
    <nav className="app-nav four" aria-label="Navigation principale"><button onClick={onLists}>🛒 <span>Listes</span></button><button className="active">🧒 <span>Crèche</span></button><button onClick={onWeather}>☁ <span>Météo</span></button><button onClick={onMeals}>🍽 <span>Repas</span></button></nav>
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
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" }).format(new Date(time));
}

function MeteoPage({ onLists, onCreche, onMeals }: { onLists: () => void; onCreche: () => void; onMeals: () => void }) {
  const weather = useEpaperWeather();

  const current = weather?.current;
  const today = weather?.today;
  const hourly = (weather?.hourly ?? []).slice(0, 6);
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
    <nav className="app-nav four" aria-label="Navigation principale"><button onClick={onLists}>🛒 <span>Listes</span></button><button onClick={onCreche}>🧒 <span>Crèche</span></button><button className="active">☁ <span>Météo</span></button><button onClick={onMeals}>🍽 <span>Repas</span></button></nav>
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

function MealPlannerPage({ onLists, onCreche, onWeather }: { onLists: () => void; onCreche: () => void; onWeather: () => void }) {
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
    <nav className="app-nav four" aria-label="Navigation principale"><button onClick={onLists}>🛒 <span>Listes</span></button><button onClick={onCreche}>🧒 <span>Crèche</span></button><button onClick={onWeather}>☁ <span>Météo</span></button><button className="active">🍽 <span>Repas</span></button></nav>
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
    if (!response.ok) { setError("Code incorrect"); return; }
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
  const [newItemsText, setNewItemsText] = useState("");
  const [newListName, setNewListName] = useState("");
  const [syncState, setSyncState] = useState<"loading" | "synced" | "error">("loading");
  const [view, setView] = useState<"lists" | "creche" | "meteo" | "meals">("lists");
  const [access, setAccess] = useState<"checking" | "denied" | "granted">("checking");

  useEffect(() => {
    void fetch("/api/access", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ authorized?: boolean }>)
      .then((data) => setAccess(data.authorized ? "granted" : "denied"))
      .catch(() => setAccess("denied"));
  }, []);

  const loadLists = useCallback(async (quiet = false) => {
    if (!quiet) setSyncState("loading");
    try {
      const response = await fetch("/api/lists", { cache: "no-store" });
      if (!response.ok) throw new Error("sync");
      const data = await response.json() as { lists: ShoppingList[] };
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

  async function mutate(action: Record<string, unknown>) {
    setSyncState("loading");
    try {
      const response = await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      if (!response.ok) throw new Error("sync");
      const data = await response.json() as { lists: ShoppingList[] };
      setLists(data.lists); setSyncState("synced"); return data.lists;
    } catch { setSyncState("error"); return null; }
  }

  const currentList = lists.find((list) => list.id === currentListId) ?? lists[0];
  const items = currentList?.items ?? [];
  const remaining = items.filter((item) => !item.checked).length;

  async function toggle(id: number) {
    const item = items.find((entry) => entry.id === id);
    if (item) await mutate({ action: "toggleItem", id, checked: !item.checked });
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
        {view === "creche" ? <CrechePage onLists={() => setView("lists")} onWeather={() => setView("meteo")} onMeals={() => setView("meals")} /> : view === "meteo" ? <MeteoPage onLists={() => setView("lists")} onCreche={() => setView("creche")} onMeals={() => setView("meals")} /> : view === "meals" ? <MealPlannerPage onLists={() => setView("lists")} onCreche={() => setView("creche")} onWeather={() => setView("meteo")} /> : <>
        <header className="topbar">
          <div>
            <p className="eyebrow">SUPERVIE · LISTE PARTAGÉE</p>
            <h1>{currentList?.name}</h1>
          </div>
          <button className="list-switch" onClick={() => setShowLists(true)} aria-label="Afficher toutes les listes">
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
            <button className="primary-action" onClick={() => setShowAdd(true)}>+ Ajouter un article</button>
            <button onClick={clearChecked}>Effacer cochés</button>
          </div>
          <p className={`sync-line ${syncState}`}><span /> {syncState === "loading" ? "Synchronisation…" : syncState === "error" ? "Hors connexion — réessayer" : "Synchronisé"}</p>
          <nav className="app-nav four" aria-label="Navigation principale"><button className="active">🛒 <span>Listes</span></button><button onClick={() => setView("creche")}>🧒 <span>Crèche</span></button><button onClick={() => setView("meteo")}>☁ <span>Météo</span></button><button onClick={() => setView("meals")}>🍽 <span>Repas</span></button></nav>
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
