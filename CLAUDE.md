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
Convention des fichiers JS de `src/`, vérifiée par la CI :
- un **module** (`import`, `export`, `await` hors fonction) porte l'extension `.mjs`, y compris un fichier seulement importé par un autre ; une page HTML le charge par `<script type="module">` ;
- un **script classique** porte l'extension `.js` : scripts de contenu (le navigateur les charge toujours ainsi) et scripts chargés par `<script>` sans `type` ;
- seule exception : l'arrière-plan déclaré `"type": "module"` dans le manifeste est un module, même en `.js`.

Un `.mjs` déclaré en script de contenu, ou en arrière-plan sans `"type": "module"`, fait échouer la CI.

- `src/` : l'extension telle qu'elle est chargée par le navigateur, `manifest.json` à la racine. Seul ce dossier est livré.
- `scripts/verifier.mjs` : vérifications propres au projet (voir « CI »).
- `tests/` : tests Vitest (`*.test.js`).

## CI
`.github/workflows/ci.yml` tourne sur chaque PR vers `main`. Deux checks, obligatoires pour fusionner, avec la relecture IA :
- **Vérifications** : `npm ci`, puis `npm run ci`, qui enchaîne :
  1. `scripts/verifier.mjs` : `manifest.json` est un JSON valide, sa version est celle de `package.json`, chaque fichier qu'il référence (icônes, fenêtre, scripts) existe, et chaque fichier JS a une syntaxe valide, selon la convention de la section « Organisation ». Le JS de `scripts/` et `tests/` est vérifié comme module. `web-ext lint` ne suit que les règles de Firefox : ce script couvre aussi ce qui ne sert qu'à Chromium ;
  2. `web-ext lint` sur `src/`, avertissements compris : le validateur de Mozilla, le même que celui du store.
- **Tests** : `npm ci`, puis `npm test`.

### Relecture IA
`.github/workflows/relecture.yml` est celui de l'API (voir « Relecture IA » dans `api/CLAUDE.md`), sur les PR vers `main` au lieu de `release/*`, avec deux différences :
- pas de PR de synchronisation : ce dépôt n'a pas de release ;
- les PR liées de l'API et du front sont cherchées vers n'importe quelle branche `release/*`, et non vers la cible de la PR relue (`main`). La release attendue est le champ Release du ticket, que le jeton du workflow ne peut pas lire : le relecteur vérifie, d'après les PR liées, que l'API et le front visent la même release. Les relectures de l'API et du front, elles, cherchent la PR de l'extension vers `main` et leurs PR liées vers leur propre release.

Le check « Relecture IA » est obligatoire pour fusionner dans `main` (ruleset), avec les deux checks de la CI.

## Git
Workflow : skill `workflow-github`. Pas de branche `release/*` : chaque branche de ticket part de `main` et y revient par PR. Une version publiée sur les stores porte le tag `vX.Y.Z`, posé sur `main` par Claude à la demande de l'utilisateur.
