# SUPERVIE

SUPERVIE est une interface familiale pensee pour un ecran e-paper tactile LILYGO T5 4,7 pouces fixe verticalement sur un refrigerateur.

Le site sert a la fois d'application web pour gerer les donnees et de backend JSON pour le firmware e-paper. L'interface reprend volontairement les contraintes de l'ecran physique: format portrait 540 x 960, contraste noir/blanc, gros boutons, peu de texte visible a la fois.

Site de production: <https://liste-frigo.pliskain.chatgpt.site>

## Etat actuel

Fonctionnalites disponibles:

- Listes de courses partagees: creation, renommage, suppression, ajout multi-lignes, coche/decocher, suppression des articles faits.
- Onglet Creche: conseil tenue de Cesar selon la meteo de Pantin.
- Onglet Meteo: meteo actuelle, min/max, 12 heures de prevision et demain.
- Onglet Repas: planning repas midi/soir sur la semaine, edition par jour, vue hebdomadaire detaillee.
- Onglet Metro: prochains passages a Raymond Queneau pour metro 5 et bus 145/147/318.
- Onglet Agenda: prototype "Semaine compacte" avec 7 jours et 2 evenements maximum par jour.
- Onglet ISS: position orbitale calculee a partir de TLE CelesTrak avec carte monde.
- Onglet Air: simulation radar autour de Pantin, partagee par le site et l'API e-paper.
- Onglet Reglages: configuration locale des onglets visibles, onglet actif et carrousel.
- API e-paper agregee: `/api/epaper/v1/state`.

Important: l'onglet Agenda est actuellement un prototype avec donnees statiques dans `app/page.tsx`. Il n'a pas encore de table D1 ni de synchronisation calendrier.

## Stack

- Vinext + React 19 + TypeScript.
- Vite 8 pour le dev/build.
- Cloudflare Worker via ChatGPT Sites.
- Cloudflare D1 pour la persistance.
- Drizzle ORM pour les tables applicatives.
- `satellite.js` pour le calcul de position ISS.
- CSS global dans `app/globals.css`, sans design system externe.

Scripts principaux:

```bash
npm install
npm run dev
npm run build
npm run lint
npm test
```

En local, le code d'acces par defaut est `supervie` si `SUPERVIE_ACCESS_CODE` n'est pas defini.

## Architecture des dossiers

```text
app/
  page.tsx                         UI principale et tous les onglets
  globals.css                      Style e-paper/web
  layout.tsx                       Metadata et layout racine
  access.ts                        Auth par code partage
  api/
    access/route.ts                Login par code + cookie
    lists/route.ts                 CRUD listes/articles
    meals/route.ts                 CRUD repas hebdo
    transit/route.ts               API IDFM PRIM + cache D1
    iss/route.ts                   Position ISS via CelesTrak + satellite.js
    epaper/v1/weather.ts           Meteo Pantin via MET Norway + Open-Meteo
    epaper/v1/state/route.ts       Snapshot complet pour firmware e-paper
db/
  schema.ts                        Tables Drizzle
  index.ts                         Binding D1 -> Drizzle
drizzle/
  *.sql                            Migrations versionnees
public/
  avatars/                         Images Cesar pour l'onglet Creche
  wardrobe/                        Calques graphiques existants
worker/
  index.ts                         Worker custom, notamment proxy image
build/
  sites-vite-plugin.ts             Plugin local Sites/Vite
scripts/
  build-verified.sh                Build + verification artefact Sites
  validate-artifact.sh             Validation Worker/hosting
tests/
  rendered-html.test.mjs           Smoke test HTML rendu
.openai/
  hosting.json                     Configuration ChatGPT Sites
```

## Modele UI

Tout est centralise dans `app/page.tsx`.

Types importants:

- `TabId`: identifiants internes des onglets web.
- `EpaperSettings`: preferences locales de navigation e-paper.
- `ShoppingList` / `Item`: donnees de listes.
- `Meal`: repas midi/soir.
- `IssState`, `EpaperWeather`, `TransitLine`: formes consommees par les vues.

Le catalogue d'onglets est `tabCatalog`. Chaque entree contient:

- `id`: identifiant React.
- `label`: libelle affiche.
- `icon`: pictogramme monochrome/grayscale.
- `epaperKey`: cle envoyee au firmware.
- `epaper`: indique si l'onglet peut apparaitre dans la navigation e-paper.

La barre du bas est rendue par `AppNav`. Elle utilise `epaperSettings.visibleTabs`, limitee a `MAX_EPAPER_TABS = 8`. Le style `tabs-8` compacte les libelles et les pictogrammes pour garder les 8 onglets lisibles sur 540 px.

Les reglages sont stockes dans `localStorage` sous `supervie-epaper-settings`. Ils ne sont pas encore persistants cote serveur.

## Onglets

`Listes`

- Source: `/api/lists`.
- Rafraichissement web: toutes les 5 secondes.
- Protection contre ecrasement d'une mutation locale via `mutationInFlight` et `listRevision`.
- Les emojis d'articles sont determines cote client par `emojiFor`.

`Creche`

- Source meteo: `useEpaperWeather()` -> `/api/epaper/v1/state`.
- Choisit un scenario visuel selon la temperature et le code meteo.
- Images dans `public/avatars/`.

`Meteo`

- Source: `/api/epaper/v1/state`, champ `pages.meteo`.
- Affiche actuel, min/max, 12 previsions horaires, demain.

`Repas`

- Source: `/api/meals`.
- Table persistante: `meal_plans`.
- Deux slots par jour: `midi` et `soir`.
- L'overlay "Toute la semaine" existe deja pour voir les 7 jours.

`Metro`

- Source: `/api/transit`.
- Favoris codifies dans `app/api/transit/route.ts`.
- Cache memoire + snapshot D1 pour resister aux limites ou echecs PRIM.
- Chaque ligne garde jusqu'a 3 passages par direction.

`Agenda`

- Source: `/api/agenda`.
- Table persistante: `agenda_events`.
- Edition web: choix du jour, creation, modification et suppression d'evenements.
- Champs: date, heure optionnelle, titre, categorie, duree optionnelle.
- Affichage e-paper: 7 colonnes, 2 evenements maximum par jour, focus sur les 2 prochains evenements.

`ISS`

- Source: `/api/iss`.
- TLE: CelesTrak, avec fallback embarque si indisponible.
- Calcul local Worker via `satellite.js`.
- Track actuel + 6 points futurs, espaces de 6 minutes.

`Air`

- Source commune: `/api/air`.
- Simulation dynamique recalculee toutes les 10 secondes.
- Le site et `/api/epaper/v1/state` lisent maintenant la meme source, donc les avions, positions et metadonnees doivent rester alignes.
- Sert surtout a tester radar, selection et densite visuelle en attendant une vraie source ADS-B.
- A remplacer par une vraie source ADS-B si besoin.

`Reglages`

- Vue web locale, non exposee au firmware comme onglet e-paper.
- Modifie `visibleTabs`, `activeTab`, `carouselEnabled`, `carouselIntervalSeconds`.
- Affiche un JSON compatible avec la forme attendue par le firmware.

## API

Toutes les API applicatives sont protegees par le code SUPERVIE, sauf mecanisme d'acces lui-meme.

Auth:

- Header accepte: `x-supervie-access-code`.
- Cookie: `supervie_access`.
- Variable de production attendue: `SUPERVIE_ACCESS_CODE`.
- En dev: fallback `supervie`.

Routes:

```text
GET  /api/access
POST /api/access

GET  /api/lists
POST /api/lists

GET  /api/meals
POST /api/meals

GET  /api/transit
GET  /api/iss
GET  /api/epaper/v1/state
```

Actions supportees par `POST /api/lists`:

- `createList`
- `renameList`
- `deleteList`
- `addItem`
- `addItems`
- `toggleItem`
- `deleteItem`
- `clearChecked`

`POST /api/meals` attend:

```json
{
  "date": "2026-09-09",
  "moment": "midi",
  "label": "Pates au pesto"
}
```

Une chaine vide supprime le repas du creneau.

## Contrat e-paper

Le firmware consomme principalement:

```text
GET /api/epaper/v1/state?listId=<id>
Header: x-supervie-access-code: <code>
```

La route agrege en parallele:

- listes D1,
- meteo Pantin,
- repas de la semaine,
- agenda de la semaine,
- transports,
- ISS,
- air simule via `/api/air`.

Elle renvoie un snapshot JSON avec:

- `schemaVersion`
- `generatedAt`
- `display`
- `activeTab`
- `epaperSettings`
- `selectedListId`
- `pages.listes`
- `pages.meteo`
- `pages.repas`
- `pages.metro`
- `pages.agenda`
- `pages.iss`
- `pages.air`

`/api/epaper/v1/state` renvoie maintenant les 8 onglets visibles par defaut: `["listes", "creche", "meteo", "repas", "metro", "agenda", "iss", "air"]`.

## Base de donnees

Tables Drizzle versionnees:

- `shopping_lists`
- `shopping_items`
- `meal_plans`

Tables creees directement par certaines routes si besoin:

- `transit_snapshots`, creee dans `app/api/transit/route.ts`.
- `meal_plans` est aussi assuree au runtime dans `app/api/meals/route.ts` pour robustesse.

Le binding D1 s'appelle `DB` et est declare dans `.openai/hosting.json`.

Limites applicatives:

- 40 listes maximum.
- 200 articles maximum par liste.
- Libelle article coupe a 160 caracteres.
- Nom de liste coupe a 80 caracteres.
- Repas coupe a 100 caracteres.

## Variables et services externes

Variables attendues en production:

- `SUPERVIE_ACCESS_CODE`: code partage pour web + firmware.
- `IDFM_PRIM_API_KEY`: cle Ile-de-France Mobilites PRIM pour les transports.

Services externes:

- MET Norway: previsions meteo.
- Open-Meteo: conditions actuelles pluie/temperature.
- Ile-de-France Mobilites PRIM: prochains passages.
- CelesTrak: TLE ISS.

Les routes meteo/transit/ISS ont des caches ou fallbacks pour eviter de casser l'interface en cas d'echec fournisseur.

## Deploiement

Le site est gere par ChatGPT Sites.

Fichier cle:

```json
{
  "d1": "DB",
  "project_id": "appgprj_6a7b7926b3948191beaeae9c0751324f",
  "r2": null
}
```

Le workflow utilise:

```bash
npm run build
```

Le script `scripts/build-verified.sh` construit l'application et verifie que l'artefact Worker Sites est valide.

La publication recente a ete faite sur:

- URL: <https://liste-frigo.pliskain.chatgpt.site>
- Branche GitHub: `main`
- Commit Agenda: `e3486c0` (`Prototype compact agenda tab`)

## Repo firmware lie

Le firmware LILYGO est dans le workspace voisin:

```text
/Users/jeanclaude/Documents/LilyGo-EPD47
```

Branche GitHub de publication firmware:

```text
firmware/liste-frigo-epaper
```

Derniere publication firmware connue:

```text
63cd1a3 Add configurable e-paper tabs and enclosure
```

Points firmware deja ajoutes:

- navigation e-paper configurable,
- pages ISS et Air,
- carrousel,
- OTA via `supervie-epaper.local`,
- contrat API documente dans `examples/liste_frigo/EPAPER_API_CONTRACT.md`,
- modele OpenSCAD de boitier magnetique dans `shell/fridge-magnetic-case/`.

Attention: le firmware supporte actuellement les cles `listes`, `creche`, `meteo`, `repas`, `metro`, `reglages`, `iss`, `air`. Pour ajouter `agenda`, il faudra modifier les enums, le parsing API, le rendu et la navigation firmware.

## Ajouter un nouvel onglet

Etapes cote site:

1. Ajouter l'identifiant dans le type `TabId`.
2. Ajouter une entree dans `tabCatalog`.
3. Decider si `epaper: true` ou seulement web.
4. Creer un composant `XPage`.
5. Ajouter la branche de rendu dans le gros ternaire de `Home`.
6. Ajouter les styles dans `app/globals.css`.
7. Si l'onglet doit aller sur le firmware, ajouter sa cle dans `/api/epaper/v1/state`.
8. Mettre a jour le firmware dans le repo LILYGO.

Points UX pour e-paper:

- Eviter les paragraphes.
- Garder des blocs stables en taille.
- Limiter le nombre d'informations simultanees.
- Preferer 3 a 7 elements forts plutot qu'une page exhaustive.
- Tester en 540 x 960 et en mobile plein ecran.

## Backlog recommande

Priorite haute:

- Porter le rendu Agenda dans le firmware.
- Ajouter des evenements recurrents si le besoin apparait.

Priorite moyenne:

- Rendre les reglages e-paper persistants cote serveur au lieu du seul `localStorage`.
- Ajouter une page statut technique: derniere synchro, batterie, Wi-Fi, version firmware.
- Remplacer la simulation Air par une vraie source ADS-B si l'onglet devient un outil temps reel.
- Ajouter des tests d'API pour les actions listes/repas.

Dette technique:

- `app/page.tsx` est devenu tres long. Une reprise serieuse devrait extraire les onglets dans `app/components/` ou `components/`.
- Certaines tables sont creees au runtime par prudence. A terme, tout devrait passer par migrations Drizzle explicites.
- Le contrat e-paper devrait avoir un fichier de types partage ou un schema JSON.
- Les reglages `activeTab` web et `activeTab` firmware sont proches mais pas parfaitement unifies.

## Bateaux / AIS

L'onglet **Bateaux** suit les signaux AIS reçus par [AISStream](https://aisstream.io/) sur une petite zone du canal de l'Ourcq autour du métro Raymond-Queneau. La connexion WebSocket et la clé restent exclusivement côté serveur. La zone et le point « Chez nous » sont centralisés dans `server/services/aisService.ts`.

Configurer `AISSTREAM_API_KEY` avec une clé AISStream. Pour tester l'API, le site et l'écran sans clé, utiliser `BOATS_USE_MOCK=true`. La route légère consommée par le site est `GET /api/boats`; l'état e-paper expose les mêmes données dans `pages.bateaux`.

En développement Cloudflare local, copier `.env.example` vers `.dev.vars`, puis adapter les valeurs avant `npm run dev`. L'émulateur Vite/Cloudflare peut refuser la sortie WebSocket vers AISStream : dans ce cas l'API reste disponible avec `status: "degraded"`; utiliser `BOATS_USE_MOCK=true` pour valider l'interface locale, puis tester le flux réel sur le Worker hébergé.

Tous les petits bateaux et toutes les péniches ne disposent pas nécessairement d'un émetteur AIS. Sur l'hébergement Cloudflare actuel, une seule collecte WebSocket est partagée dans chaque instance active et relancée par les lectures de l'API avec backoff. Une connexion permanente et une unicité mondiale stricte nécessiteraient un Durable Object.

## Commandes utiles

Dev local:

```bash
npm run dev
```

Build production:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Tests:

```bash
npm test
```

Migration Drizzle:

```bash
npm run db:generate
```

Etat Git:

```bash
git status --short --branch
git log --oneline --decorate -8
```

## Notes pour la prochaine IA

- Ne pas supprimer `.openai/hosting.json`: il contient l'ID opaque du site Sites existant.
- Ne pas changer le nom du binding D1 `DB` sans changer `db/index.ts` et la config Sites.
- Ne pas stocker de secret dans le repo.
- Le site public reste protege applicativement par code SUPERVIE.
- Le rendu web est aussi une maquette du firmware: garder la contrainte 540 x 960 en tete.
- Les donnees Agenda sont volontairement fausses pour l'instant: c'est un test de lisibilite.
- Pour pousser sur GitHub, la branche source du site est `main` sur `https://github.com/broduoliviercontact-web/liste-frigo.git`.
