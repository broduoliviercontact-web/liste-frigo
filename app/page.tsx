"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

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

function CrechePage({ onLists, onWardrobe }: { onLists: () => void; onWardrobe: () => void }) {
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
    <nav className="app-nav three" aria-label="Navigation principale"><button onClick={onLists}>🛒 <span>Listes</span></button><button className="active">🧒 <span>Crèche</span></button><button onClick={onWardrobe}>▣ <span>Tenues</span></button></nav>
  </div>;
}

type LayerSettings = { x: number; y: number; scale: number };
type WardrobeLayerId = "body" | "pants";

const defaultLayerSettings: Record<WardrobeLayerId, LayerSettings> = {
  body: { x: 0, y: 7, scale: 58 },
  pants: { x: 0, y: 23, scale: 58 },
};

function WardrobePage({ onLists, onCreche }: { onLists: () => void; onCreche: () => void }) {
  const [settings, setSettings] = useState(defaultLayerSettings);
  const [selected, setSelected] = useState<WardrobeLayerId>("body");
  const [visible, setVisible] = useState<Record<WardrobeLayerId, boolean>>({ body: true, pants: true });

  useEffect(() => {
    const body = window.localStorage.getItem("cesar-body-cotele-settings");
    const pants = window.localStorage.getItem("cesar-pantalon-oursons-settings");
    try {
      setSettings({ body: body ? JSON.parse(body) as LayerSettings : defaultLayerSettings.body, pants: pants ? JSON.parse(pants) as LayerSettings : defaultLayerSettings.pants });
    } catch {
      setSettings(defaultLayerSettings);
    }
  }, []);

  function update(patch: Partial<LayerSettings>) {
    setSettings((current) => {
      const layer = { ...current[selected], ...patch };
      const next = { ...current, [selected]: layer };
      window.localStorage.setItem(selected === "body" ? "cesar-body-cotele-settings" : "cesar-pantalon-oursons-settings", JSON.stringify(layer));
      return next;
    });
  }

  const active = settings[selected];
  const selectedName = selected === "body" ? "le body" : "le pantalon";

  return <div className="wardrobe-page">
    <header className="wardrobe-header"><div><p className="eyebrow">GARDE-ROBE</p><h1>Habiller César</h1></div><span>2 VÊTEMENTS</span></header>
    <section className="wardrobe-workspace" aria-label="Aperçu des calques">
      <div className="wardrobe-canvas">
        <img className="avatar-base" src="/wardrobe/base/cesar-base-epaper.png" alt="César dans la pose de base" />
        {visible.body && <img className="clothing-layer" src="/wardrobe/tops/body-cotele-clair-layer.png" alt="Calque du body côtelé clair" style={{ transform: `translate(${settings.body.x}%, ${settings.body.y}%) scale(${settings.body.scale / 100})` }} />}
        {visible.pants && <img className="clothing-layer pants-layer" src="/wardrobe/bottoms/pantalon-oursons-layer.png" alt="Calque du pantalon à oursons" style={{ transform: `translate(${settings.pants.x}%, ${settings.pants.y}%) scale(${settings.pants.scale / 100})` }} />}
      </div>
      <div className="layer-list">
        <div className={`layer-card ${selected === "body" ? "selected" : ""}`}><button className="select-layer" onClick={() => setSelected("body")}><span className="layer-eye">●</span><span><strong>Body côtelé clair</strong><small>HAUT · CALQUE 01</small></span></button><button className="toggle-layer" aria-label={`${visible.body ? "Masquer" : "Afficher"} le body côtelé`} onClick={() => setVisible((current) => ({ ...current, body: !current.body }))}>{visible.body ? "✓" : ""}</button></div>
        <div className={`layer-card ${selected === "pants" ? "selected" : ""}`}><button className="select-layer" onClick={() => setSelected("pants")}><span className="layer-eye">●</span><span><strong>Pantalon oursons</strong><small>BAS · CALQUE 02</small></span></button><button className="toggle-layer" aria-label={`${visible.pants ? "Masquer" : "Afficher"} le pantalon à oursons`} onClick={() => setVisible((current) => ({ ...current, pants: !current.pants }))}>{visible.pants ? "✓" : ""}</button></div>
      </div>
    </section>
    <section className="calibration-panel">
      <div className="calibration-title"><div><p className="eyebrow">CALIBRAGE</p><strong>Ajuster {selectedName}</strong></div><button onClick={() => update(defaultLayerSettings[selected])}>Réinitialiser</button></div>
      <div className="adjust-row"><span>↔ Position</span><button aria-label={`Déplacer ${selectedName} à gauche`} onClick={() => update({ x: active.x - 1 })}>←</button><output>{active.x}</output><button aria-label={`Déplacer ${selectedName} à droite`} onClick={() => update({ x: active.x + 1 })}>→</button></div>
      <div className="adjust-row"><span>↕ Hauteur</span><button aria-label={`Déplacer ${selectedName} vers le haut`} onClick={() => update({ y: active.y - 1 })}>↑</button><output>{active.y}</output><button aria-label={`Déplacer ${selectedName} vers le bas`} onClick={() => update({ y: active.y + 1 })}>↓</button></div>
      <div className="adjust-row"><span>⤢ Taille</span><button aria-label={`Réduire ${selectedName}`} onClick={() => update({ scale: Math.max(40, active.scale - 1) })}>−</button><output>{active.scale}%</output><button aria-label={`Agrandir ${selectedName}`} onClick={() => update({ scale: Math.min(90, active.scale + 1) })}>+</button></div>
      <p className="saved-setting">● Réglage sauvegardé sur cet appareil</p>
    </section>
    <nav className="app-nav three" aria-label="Navigation principale"><button onClick={onLists}>🛒 <span>Listes</span></button><button onClick={onCreche}>🧒 <span>Crèche</span></button><button className="active">▣ <span>Tenues</span></button></nav>
  </div>;
}

export default function Home() {
  const [lists, setLists] = useState(initialLists);
  const [currentListId, setCurrentListId] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showLists, setShowLists] = useState(false);
  const [showFullList, setShowFullList] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [newListName, setNewListName] = useState("");
  const [syncState, setSyncState] = useState<"loading" | "synced" | "error">("loading");
  const [view, setView] = useState<"lists" | "creche" | "wardrobe">("lists");

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
    const initialTimer = window.setTimeout(() => loadLists(), 0);
    const timer = window.setInterval(() => loadLists(true), 5000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [loadLists]);

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

  return (
    <main className="stage">
      <section className="device" aria-label="Aperçu de l'écran SUPERVIE">
        {view === "creche" ? <CrechePage onLists={() => setView("lists")} onWardrobe={() => setView("wardrobe")} /> : view === "wardrobe" ? <WardrobePage onLists={() => setView("lists")} onCreche={() => setView("creche")} /> : <>
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
          <div className="quick-actions">
            <button className="primary-action" onClick={() => setShowAdd(true)}>+ Ajouter un article</button>
            <button onClick={clearChecked}>Effacer cochés</button>
          </div>
          <p className={`sync-line ${syncState}`}><span /> {syncState === "loading" ? "Synchronisation…" : syncState === "error" ? "Hors connexion — réessayer" : "Synchronisé"}</p>
          <nav className="app-nav three" aria-label="Navigation principale"><button className="active">🛒 <span>Listes</span></button><button onClick={() => setView("creche")}>🧒 <span>Crèche</span></button><button onClick={() => setView("wardrobe")}>▣ <span>Tenues</span></button></nav>
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
            <ul className="full-shopping-list" aria-label="Tous les articles">
              {items.map((item) => (
                <li key={item.id} className={item.checked ? "checked" : ""}>
                  <button
                    className="item-button"
                    onClick={() => toggle(item.id)}
                    aria-label={`${item.checked ? "Décocher" : "Cocher"} ${item.label}`}
                  >
                    <span className="checkbox" aria-hidden="true">{item.checked ? "✓" : ""}</span>
                    <span className="item-emoji" aria-hidden="true">{emojiFor(item.label)}</span>
                    <span className="item-label">{item.label}</span>
                  </button>
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
