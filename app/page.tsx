"use client";

import { FormEvent, useState } from "react";

type Item = { id: number; label: string; checked: boolean };

const initialItems: Item[] = [
  { id: 1, label: "Pain", checked: false },
  { id: 2, label: "Lait", checked: false },
  { id: 3, label: "Café", checked: true },
  { id: 4, label: "Pommes", checked: false },
  { id: 5, label: "Dentifrice", checked: false },
];

export default function Home() {
  const [items, setItems] = useState(initialItems);
  const [showAdd, setShowAdd] = useState(false);
  const [showWrite, setShowWrite] = useState(false);
  const [newItem, setNewItem] = useState("");

  const remaining = items.filter((item) => !item.checked).length;

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

  return (
    <main className="stage">
      <section className="device" aria-label="Aperçu de l'écran Liste Frigo">
        <header className="topbar">
          <div>
            <p className="eyebrow">LISTE PARTAGÉE</p>
            <h1>Courses</h1>
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
