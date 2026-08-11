"use client";

import { FormEvent, useState } from "react";

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
  [["lessive"], "🧺"],
  [["éponge", "eponge"], "🧽"],
];

function emojiFor(label: string) {
  const normalized = label.toLocaleLowerCase("fr").trim();
  return groceryEmojis.find(([words]) =>
    words.some((word) => normalized.includes(word)),
  )?.[1] ?? "🛒";
}

export default function Home() {
  const [lists, setLists] = useState(initialLists);
  const [currentListId, setCurrentListId] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showWrite, setShowWrite] = useState(false);
  const [showLists, setShowLists] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [newListName, setNewListName] = useState("");

  const currentList = lists.find((list) => list.id === currentListId) ?? lists[0];
  const items = currentList?.items ?? [];
  const remaining = items.filter((item) => !item.checked).length;

  function setItems(update: (items: Item[]) => Item[]) {
    setLists((current) => current.map((list) =>
      list.id === currentListId ? { ...list, items: update(list.items) } : list,
    ));
  }

  function toggle(id: number) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item,
      ),
    );
  }

  function addItem(event: FormEvent) {
    event.preventDefault();
    const label = newItem.trim();
    if (!label) return;
    setItems((current) => [
      ...current,
      { id: Date.now(), label, checked: false },
    ]);
    setNewItem("");
    setShowAdd(false);
  }

  function clearChecked() {
    setItems((current) => current.filter((item) => !item.checked));
  }

  function createList(event: FormEvent) {
    event.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    const id = Date.now();
    setLists((current) => [...current, { id, name, items: [] }]);
    setCurrentListId(id);
    setNewListName("");
    setShowLists(false);
  }

  function renameList(id: number) {
    const list = lists.find((entry) => entry.id === id);
    const name = window.prompt("Nouveau nom de la liste :", list?.name)?.trim();
    if (name) setLists((current) => current.map((entry) => entry.id === id ? { ...entry, name } : entry));
  }

  function deleteList(id: number) {
    if (lists.length === 1) return;
    const list = lists.find((entry) => entry.id === id);
    if (!window.confirm(`Supprimer la liste « ${list?.name} » ?`)) return;
    const remainingLists = lists.filter((entry) => entry.id !== id);
    setLists(remainingLists);
    if (currentListId === id) setCurrentListId(remainingLists[0].id);
  }

  return (
    <main className="stage">
      <section className="device" aria-label="Aperçu de l'écran Liste Frigo">
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
          <p className="sync-line"><span /> Synchronisé à l'instant</p>
        </footer>

        {showAdd && (
          <div className="overlay" role="dialog" aria-modal="true" aria-label="Ajouter un article">
            <form className="panel" onSubmit={addItem}>
              <p className="eyebrow">NOUVEL ARTICLE</p>
              <label htmlFor="new-item">Qu'est-ce qu'il faut acheter&nbsp;?</label>
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
              <span>pain</span>
              <i className="stroke stroke-one" />
              <i className="stroke stroke-two" />
              <i className="stroke stroke-three" />
            </div>
            <div className="detected-word">
              <span>Mot détecté</span>
              <strong>pain</strong>
            </div>
            <div className="write-actions">
              <button>Recommencer</button>
              <button
                className="inverted"
                onClick={() => {
                  setItems((current) => [...current, { id: Date.now(), label: "Pain", checked: false }]);
                  setShowWrite(false);
                }}
              >Ajouter →</button>
            </div>
          </div>
        )}
      </section>
      <p className="prototype-note">Prototype portrait · LILYGO T5 4,7″ · 540 × 960</p>
    </main>
  );
}
