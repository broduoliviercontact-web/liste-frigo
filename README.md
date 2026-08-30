# SUPERVIE

Une liste de courses partagée conçue pour un écran e-paper tactile LILYGO T5 4,7 pouces fixé verticalement sur un réfrigérateur.

## Fonctionnalités

- Interface portrait noir et blanc adaptée à l'e-paper
- Plusieurs listes indépendantes
- Ajout au clavier
- Simulation d'écriture au stylet
- Emojis automatiques selon les articles
- Articles à cocher et suppression des articles cochés
- Persistance et synchronisation via Cloudflare D1
- Actualisation automatique entre appareils

## Architecture

- Vinext / React
- API intégrée dans `app/api/lists/route.ts`
- Schéma D1 avec Drizzle dans `db/schema.ts`
- Migrations dans `drizzle/`
- Hébergement ChatGPT Sites

## Site

https://liste-frigo.pliskain.chatgpt.site

## Développement

```bash
npm install
npm run dev
```

Validation :

```bash
npm run lint
npm run build
```

La base D1 de production est gérée par l'hébergement Sites. Le dépôt contient le schéma et les migrations, mais aucune donnée personnelle ni clé secrète.
