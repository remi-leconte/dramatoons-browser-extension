# Dramatoons : extension navigateur

Extension « Dramatoons Highlighter », commune à Firefox et aux navigateurs Chromium (Chrome, Edge) : un seul code et un seul manifeste (Manifest V3). JavaScript sans framework ni étape de construction. Règles métier : `extension.md` du skill `regles-metier` (workspace).

Elle remplace les anciennes extensions `dramatoons-extension-firefox` et `dramatoons-extension-chromium` (version 2.x), gardées telles quelles jusqu'à sa publication. Elle reprend l'identifiant Firefox de l'ancienne (`browser_specific_settings.gecko.id`), qui ne doit jamais changer : c'est lui qui fait de chaque version une mise à jour de la fiche du store de Mozilla. Sa version suit celle du site (`2.5.0` pour la v2.5.0), et doit rester supérieure aux versions déjà publiées sur les stores.

## Commandes
Node n'est pas installé sur le poste : les commandes tournent dans le conteneur `node` de `compose.yaml`. Depuis `extension/` :

```sh
docker compose run --rm node npm ci        # installe les dépendances (node_modules/)
docker compose run --rm node npm run ci    # vérifications de la CI (voir « CI »)
docker compose run --rm node npm test      # tests Vitest
```

## Organisation
- `src/` : l'extension telle qu'elle est chargée par le navigateur, `manifest.json` à la racine. Seul ce dossier est livré.
- `scripts/verifier.mjs` : vérifications propres au projet (voir « CI »).
- `tests/` : tests Vitest (`*.test.js`).

## CI
`.github/workflows/ci.yml` tourne sur chaque PR vers `main`. Deux checks, obligatoires pour fusionner, avec la relecture IA :
- **Vérifications** : `npm ci`, puis `npm run ci`, qui enchaîne :
  1. `scripts/verifier.mjs` : `manifest.json` est un JSON valide, sa version est celle de `package.json`, chaque fichier qu'il référence (icônes, fenêtre, scripts) existe, et chaque fichier JS a une syntaxe valide. Le navigateur charge les `.js` de `src/` comme des scripts classiques : ils sont vérifiés ainsi, et un `import` ou un `await` hors fonction y est une erreur. Les `.mjs` de `src/`, un arrière-plan déclaré `"type": "module"` dans le manifeste, et tout le JS de `scripts/` et `tests/` sont vérifiés comme des modules. `web-ext lint` ne suit que les règles de Firefox : ce script couvre aussi ce qui ne sert qu'à Chromium ;
  2. `web-ext lint` sur `src/`, avertissements compris : le validateur de Mozilla, le même que celui du store.
- **Tests** : `npm ci`, puis `npm test`.

### Relecture IA
`.github/workflows/relecture.yml` est celui de l'API (voir « Relecture IA » dans `api/CLAUDE.md`), sur les PR vers `main` au lieu de `release/*`, avec deux différences :
- pas de PR de synchronisation : ce dépôt n'a pas de release ;
- les PR liées des autres dépôts sont cherchées quelle que soit leur cible, puisque l'API et le front livrent par release et l'extension par `main`.

Le check « Relecture IA » est obligatoire pour fusionner dans `main` (ruleset), avec les deux checks de la CI.

## Git
Workflow : skill `workflow-github`. Pas de branche `release/*` : chaque branche de ticket part de `main` et y revient par PR. Une version publiée sur les stores porte le tag `vX.Y.Z`, posé sur `main` par Claude à la demande de l'utilisateur.
