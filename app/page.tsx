"use client";

import { FormEvent, PointerEvent, useCallback, useEffect, useRef, useState } from "react";

type Item = { id: number; label: string; checked: boolean };
type ShoppingList = { id: number; name: string; items: Item[] };

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

function CrechePage({ onLists, onWardrobe, onVelib, onTransport }: { onLists: () => void; onWardrobe: () => void; onVelib: () => void; onTransport: () => void }) {
  const [mode, setMode] = useState<WeatherMode>("canicule");
  const weather = weatherScenarios[mode];
  return <div className="creche-page">
    <header className="creche-header">
      <div><p className="eyebrow">MÉTÉO CRÈCHE</p><h1>Pantin</h1></div>
      <div className="weather-now"><strong>{weather.now}</strong><span>{weather.icon}</span><small>12 AOÛT</small></div>
    </header>
    <div className="weather-demo" aria-label="Tester une tenue météo">
      {(Object.keys(weatherScenarios) as WeatherMode[]).map((key) => <button key={key} className={mode === key ? "active" : ""} onClick={() => setMode(key)}>{weatherScenarios[key].label}</button>)}
    </div>
    <section className="morning-card">
      <div className="period-title"><div><p className="eyebrow">DÉPART · 8H</p><strong>{weather.morning}</strong></div><span>{weather.rain}</span></div>
      <div className="avatar-and-clothes">
        <div className="baby-avatar"><img src={weather.image} alt={`César habillé pour un temps ${weather.label.toLowerCase()}, avec son doudou girafe`} /></div>
        <ul>{weather.clothes.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
    </section>
    <section className="evening-card">
      <div><p className="eyebrow">RETOUR · 17H</p><strong>{weather.evening}</strong></div>
      <div className="sun-advice"><span>{weather.icon}</span><p><strong>{weather.feeling}</strong><br />{weather.advice}</p></div>
    </section>
    <p className="weather-update"><span /> Brief du 12 août · démonstration</p>
    <nav className="app-nav five" aria-label="Navigation principale"><button onClick={onLists}>🛒 <span>Listes</span></button><button className="active">🧒 <span>Crèche</span></button><button onClick={onWardrobe}>▣ <span>Tenues</span></button><button onClick={onVelib}>⚡ <span>Vélib</span></button><button onClick={onTransport}>Ⓜ <span>Transp.</span></button></nav>
  </div>;
}

type VelibStation = { id: string; name: string; distance: number; electric: number; mechanical: number; docks: number };

function VelibPage({ onLists, onCreche, onWardrobe, onTransport }: { onLists: () => void; onCreche: () => void; onWardrobe: () => void; onTransport: () => void }) {
  const [stations, setStations] = useState<VelibStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/velib", { cache: "no-store" });
      if (!response.ok) throw new Error("velib");
      const data = await response.json() as { stations: VelibStation[]; updatedAt: number };
      setStations(data.stations); setUpdatedAt(data.updatedAt); setError(false);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 30000); return () => window.clearInterval(timer); }, [refresh]);

  return <div className="velib-page">
    <header className="velib-header"><div><p className="eyebrow">AUTOUR DE CHEZ NOUS</p><h1>Vélib proches</h1></div><span className="velib-bolt">⚡</span></header>
    <div className="velib-priority"><strong>ÉLECTRIQUES EN PRIORITÉ</strong><span>Depuis Colonel Fabien · Pantin</span></div>
    <section className="velib-stations" aria-label="Stations Vélib les plus proches" aria-live="polite">
      {loading ? <p className="velib-message">Recherche des vélos disponibles…</p> : error ? <button className="velib-message" onClick={refresh}>Données indisponibles · Réessayer</button> : stations.map((station, index) => <article className={`velib-station ${station.electric > 0 ? "has-electric" : ""}`} key={station.id}>
        <div className="velib-rank"><strong>{index + 1}</strong><span>{station.distance} m</span></div>
        <div className="velib-name"><strong>{station.name}</strong>{station.electric > 0 && <span>⚡ Disponible</span>}</div>
        <div className="bike-count electric"><strong>{station.electric}</strong><span>élect.</span></div>
        <div className="bike-count"><strong>{station.mechanical}</strong><span>méca.</span></div>
        <div className="bike-count docks"><strong>{station.docks}</strong><span>places</span></div>
      </article>)}
    </section>
    <p className="velib-update"><span /> {updatedAt ? `Actualisé à ${new Date(updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Données Vélib en direct"}</p>
    <nav className="app-nav five" aria-label="Navigation principale"><button onClick={onLists}>🛒 <span>Listes</span></button><button onClick={onCreche}>🧒 <span>Crèche</span></button><button onClick={onWardrobe}>▣ <span>Tenues</span></button><button className="active">⚡ <span>Vélib</span></button><button onClick={onTransport}>Ⓜ <span>Transp.</span></button></nav>
  </div>;
}

const outfits = [
  { id: "canicule", name: "Canicule", detail: "Chapeau · short", image: "/avatars/cesar-canicule-epaper.png" },
  { id: "doux", name: "Temps doux", detail: "T-shirt · gilet", image: "/avatars/cesar-doux-epaper.png" },
  { id: "pluie", name: "Jour de pluie", detail: "Ciré · bottes", image: "/avatars/cesar-pluie-epaper.png" },
  { id: "froid", name: "Grand froid", detail: "Manteau · bonnet", image: "/avatars/cesar-froid-epaper.png" },
  { id: "chemise", name: "Chemise", detail: "Carreaux · pantalon", image: "/outfits/cesar-tenue-chemise-epaper.png" },
  { id: "pull", name: "Pull clair", detail: "Côtelé · pantalon", image: "/outfits/cesar-tenue-pull-epaper.png" },
  { id: "oursons", name: "Oursons", detail: "Body · pantalon", image: "/outfits/cesar-tenue-oursons-epaper.png" },
  { id: "ete", name: "Été léger", detail: "T-shirt · short", image: "/outfits/cesar-tenue-ete-epaper.png" },
];

function WardrobePage({ onLists, onCreche, onVelib, onTransport }: { onLists: () => void; onCreche: () => void; onVelib: () => void; onTransport: () => void }) {
  const [selected, setSelected] = useState("canicule");
  const current = outfits.find((outfit) => outfit.id === selected) ?? outfits[0];

  return <div className="wardrobe-page">
    <header className="wardrobe-header"><div><p className="eyebrow">TENUES DE CÉSAR</p><h1>Choisir une tenue</h1></div><span>{outfits.length} IMAGES</span></header>
    <section className="outfit-preview" aria-live="polite">
      <img src={current.image} alt={`César avec la tenue ${current.name}`} />
      <div><p className="eyebrow">TENUE SÉLECTIONNÉE</p><strong>{current.name}</strong><span>{current.detail}</span></div>
    </section>
    <section className="outfit-gallery" aria-label="Galerie des tenues complètes">
      {outfits.map((outfit) => <button key={outfit.id} className={selected === outfit.id ? "selected" : ""} onClick={() => setSelected(outfit.id)} aria-pressed={selected === outfit.id}>
        <img src={outfit.image} alt="" /><span><strong>{outfit.name}</strong><small>{outfit.detail}</small></span>
      </button>)}
    </section>
    <nav className="app-nav five" aria-label="Navigation principale"><button onClick={onLists}>🛒 <span>Listes</span></button><button onClick={onCreche}>🧒 <span>Crèche</span></button><button className="active">▣ <span>Tenues</span></button><button onClick={onVelib}>⚡ <span>Vélib</span></button><button onClick={onTransport}>Ⓜ <span>Transp.</span></button></nav>
  </div>;
}

function TransportPage({ onLists, onCreche, onWardrobe, onVelib }: { onLists: () => void; onCreche: () => void; onWardrobe: () => void; onVelib: () => void }) {
  return <div className="transport-page">
    <header className="transport-header">
      <div><p className="eyebrow">DÉPARTS À PROXIMITÉ</p><h1>Transports</h1></div>
      <span className="metro-sign">M</span>
    </header>
    <section className="station-summary">
      <div><p className="eyebrow">STATION LA PLUS PROCHE</p><strong>Raymond-Queneau</strong><span>Bobigny · Pantin</span></div>
      <div className="walk-time"><strong>5</strong><span>min<br />à pied</span></div>
    </section>
    <section className="metro-board" aria-label="Métro ligne 5">
      <header><span className="line-five">5</span><div><p className="eyebrow">MÉTRO</p><strong>Ligne 5</strong></div></header>
      <article><div><span>Direction</span><strong>Place d’Italie</strong></div><p className="awaiting-time">— <small>min</small></p></article>
      <article><div><span>Direction</span><strong>Bobigny–Pablo Picasso</strong></div><p className="awaiting-time">— <small>min</small></p></article>
    </section>
    <section className="nearby-buses">
      <p className="eyebrow">BUS À LA STATION</p>
      <div>{["145", "147", "318", "330"].map((line) => <span key={line}>{line}</span>)}</div>
    </section>
    <section className="transport-connect">
      <strong>Temps réel prêt à connecter</strong>
      <p>Ajoute la clé gratuite Île-de-France Mobilités pour afficher les prochains passages et les perturbations.</p>
    </section>
    <p className="transport-update"><span /> Station et lignes configurées</p>
    <nav className="app-nav five" aria-label="Navigation principale"><button onClick={onLists}>🛒 <span>Listes</span></button><button onClick={onCreche}>🧒 <span>Crèche</span></button><button onClick={onWardrobe}>▣ <span>Tenues</span></button><button onClick={onVelib}>⚡ <span>Vélib</span></button><button className="active">Ⓜ <span>Transp.</span></button></nav>
  </div>;
}

export default function Home() {
  const [lists, setLists] = useState(initialLists);
  const [currentListId, setCurrentListId] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showWrite, setShowWrite] = useState(false);
  const [showLists, setShowLists] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [newListName, setNewListName] = useState("");
  const [recognizedWord, setRecognizedWord] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [syncState, setSyncState] = useState<"loading" | "synced" | "error">("loading");
  const [view, setView] = useState<"lists" | "creche" | "wardrobe" | "velib" | "transport">("lists");

  const loadLists = useCallback(async (quiet = false) => {
    if (!quiet) setSyncState("loading");
    try {
      const response = await fetch("/api/lists", { cache: "no-store" });
      if (!response.ok) throw new Error("sync");
      const data = await response.json() as { lists: ShoppingList[]; activeListId?: number };
      setLists(data.lists);
      setCurrentListId((current) => data.activeListId && data.lists.some((list) => list.id === data.activeListId) ? data.activeListId : data.lists.some((list) => list.id === current) ? current : data.lists[0]?.id ?? 0);
      setSyncState("synced");
    } catch { setSyncState("error"); }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => loadLists(), 0);
    const timer = window.setInterval(() => loadLists(true), 5000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [loadLists]);

  async function mutate(action: Record<string, unknown>) {
    setSyncState("loading");
    try {
      const response = await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      if (!response.ok) throw new Error("sync");
      const data = await response.json() as { lists: ShoppingList[]; activeListId?: number };
      setLists(data.lists);
      if (data.activeListId && data.lists.some((list) => list.id === data.activeListId)) setCurrentListId(data.activeListId);
      setSyncState("synced"); return data.lists;
    } catch { setSyncState("error"); return null; }
  }

  const currentList = lists.find((list) => list.id === currentListId) ?? lists[0];
  const items = currentList?.items ?? [];
  const remaining = items.filter((item) => !item.checked).length;

  async function toggle(id: number) {
    const item = items.find((entry) => entry.id === id);
    if (item) await mutate({ action: "toggleItem", id, checked: !item.checked });
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    const label = newItem.trim();
    if (!label) return;
    await mutate({ action: "addItem", listId: currentListId, label });
    setNewItem("");
    setShowAdd(false);
  }

  async function clearChecked() {
    await mutate({ action: "clearChecked", listId: currentListId });
  }

  async function createList(event: FormEvent) {
    event.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    const updated = await mutate({ action: "createList", name });
    if (updated?.length) {
      const id = updated[updated.length - 1].id;
      setCurrentListId(id);
      await mutate({ action: "selectList", id });
    }
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

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (event.type === "pointerdown") {
      drawingRef.current = true;
      canvas.setPointerCapture(event.pointerId);
      ctx.beginPath(); ctx.moveTo(x, y);
    } else if (event.type === "pointermove" && drawingRef.current) {
      ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111";
      ctx.lineTo(x, y); ctx.stroke(); setHasInk(true);
    } else drawingRef.current = false;
  }

  function clearWriting() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false); setRecognizedWord("");
  }

  return (
    <main className="stage">
      <section className="device" aria-label="Aperçu de l'écran Liste Frigo">
        {view === "creche" ? <CrechePage onLists={() => setView("lists")} onWardrobe={() => setView("wardrobe")} onVelib={() => setView("velib")} onTransport={() => setView("transport")} /> : view === "wardrobe" ? <WardrobePage onLists={() => setView("lists")} onCreche={() => setView("creche")} onVelib={() => setView("velib")} onTransport={() => setView("transport")} /> : view === "velib" ? <VelibPage onLists={() => setView("lists")} onCreche={() => setView("creche")} onWardrobe={() => setView("wardrobe")} onTransport={() => setView("transport")} /> : view === "transport" ? <TransportPage onLists={() => setView("lists")} onCreche={() => setView("creche")} onWardrobe={() => setView("wardrobe")} onVelib={() => setView("velib")} /> : <>
        <header className="topbar">
          <div>
            <p className="eyebrow">LISTE PARTAGÉE</p>
            <button className="list-title" onClick={() => setShowLists(true)} aria-label="Changer ou gérer les listes">
              <h1>{currentList?.name}</h1><span>⌄</span>
            </button>
          </div>
          <div className="status" aria-label="Synchronisation active">
            <span className="wifi">)))</span>
            <span>21:32</span>
          </div>
        </header>

        <div className="summary">
          <strong>{remaining}</strong>
          <span>{remaining > 1 ? "articles à acheter" : "article à acheter"}</span>
        </div>

        <ul className="shopping-list" aria-label="Articles">
          {items.map((item) => (
            <li key={item.id} className={item.checked ? "checked" : ""}>
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
            </li>
          ))}
        </ul>

        <footer className="controls">
          <button className="primary-action" onClick={() => setShowWrite(true)}>
            <span className="pen-mark" aria-hidden="true">/</span>
            Écrire
          </button>
          <div className="secondary-actions">
            <button onClick={() => setShowAdd(true)}>+ Clavier</button>
            <button onClick={clearChecked}>Effacer cochés</button>
          </div>
          <p className={`sync-line ${syncState}`}><span /> {syncState === "loading" ? "Synchronisation…" : syncState === "error" ? "Hors connexion — réessayer" : "Synchronisé"}</p>
          <nav className="app-nav five" aria-label="Navigation principale"><button className="active">🛒 <span>Listes</span></button><button onClick={() => setView("creche")}>🧒 <span>Crèche</span></button><button onClick={() => setView("wardrobe")}>▣ <span>Tenues</span></button><button onClick={() => setView("velib")}>⚡ <span>Vélib</span></button><button onClick={() => setView("transport")}>Ⓜ <span>Transp.</span></button></nav>
        </footer>

        {showAdd && (
          <div className="overlay" role="dialog" aria-modal="true" aria-label="Ajouter un article">
            <form className="panel" onSubmit={addItem}>
              <p className="eyebrow">NOUVEL ARTICLE</p>
              <label htmlFor="new-item">Qu&apos;est-ce qu&apos;il faut acheter&nbsp;?</label>
              <input
                id="new-item"
                value={newItem}
                onChange={(event) => setNewItem(event.target.value)}
                autoFocus
                placeholder="Ex. Tomates"
              />
              <div className="panel-actions">
                <button type="button" onClick={() => setShowAdd(false)}>Annuler</button>
                <button type="submit" className="inverted">Ajouter</button>
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
                    <button className="choose-list" onClick={async () => { setCurrentListId(list.id); setShowLists(false); await mutate({ action: "selectList", id: list.id }); }}>
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

        {showWrite && (
          <div className="write-screen" role="dialog" aria-modal="true" aria-label="Écriture au stylet">
            <header>
              <div>
                <p className="eyebrow">ÉCRITURE AU STYLET</p>
                <h2>Écris un article</h2>
              </div>
              <button onClick={() => setShowWrite(false)} aria-label="Fermer">×</button>
            </header>
            <div className="writing-zone">
              {!hasInk && <span>Écris ici…</span>}
              <canvas ref={canvasRef} width="900" height="900" onPointerDown={draw} onPointerMove={draw} onPointerUp={draw} onPointerCancel={draw} />
            </div>
            <div className="detected-word">
              <span>Mot détecté</span>
              <input value={recognizedWord} onChange={(event) => setRecognizedWord(event.target.value)} placeholder="—" aria-label="Mot détecté modifiable" />
            </div>
            <div className="write-actions">
              <button onClick={clearWriting}>Effacer</button>
              {!recognizedWord ? <button className="inverted" disabled={!hasInk} onClick={() => setRecognizedWord("Tomates")}>Reconnaître</button> :
              <button
                className="inverted"
                onClick={async () => {
                  await mutate({ action: "addItem", listId: currentListId, label: recognizedWord });
                  clearWriting(); setShowWrite(false);
                }}
              >Ajouter →</button>}
            </div>
          </div>
        )}
        </>}
      </section>
      <p className="prototype-note">Prototype portrait · LILYGO T5 4,7″ · 540 × 960</p>
    </main>
  );
}
