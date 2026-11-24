# Dramatoons Highlighter

[![Livraison](https://github.com/remi-leconte/dramatoons-browser-extension/actions/workflows/livraison.yml/badge.svg)](https://github.com/remi-leconte/dramatoons-browser-extension/actions/workflows/livraison.yml)
[![Dernière release](https://img.shields.io/github/v/release/remi-leconte/dramatoons-browser-extension?label=release)](https://github.com/remi-leconte/dramatoons-browser-extension/releases/latest)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

Extension de navigateur de [Dramatoons](https://dramatoons.ovh), un site de suivi de lecture de webtoons (bandes dessinées en ligne) : sur n'importe quel site, elle surligne les titres des webtoons de la bibliothèque du lecteur, avec sa note et son dernier chapitre lu. Le lecteur voit ainsi d'un coup d'œil, sur un site de lecture ou une liste de nouveautés, ce qu'il suit déjà et où il en est.

> **Dramatoons n'héberge aucun webtoon.** Il conserve la fiche de chaque webtoon (titres, statut, couverture) et la progression de chaque lecteur (dernier chapitre lu, note, état), jamais le contenu des webtoons : aucun chapitre, aucune planche, et aucun lien vers des plateformes de diffusion non autorisées. L'extension ne fait que surligner, dans la page affichée, des titres que le lecteur suit déjà.

## Fonctionnalités

- **Connexion** avec son compte Dramatoons, depuis la fenêtre de l'extension. La session est gardée à la fermeture du navigateur et se prolonge seule, comme sur le site.
- **Activation onglet par onglet** : un interrupteur dans la fenêtre. Un onglet activé le reste quand on y change de page ; un onglet désactivé ne reçoit aucun script injecté et ne fait aucun appel à l'API.
- **Surlignage des titres**, principaux et alternatifs, sans tenir compte de la casse, des accents ni de la ponctuation, et seulement sur des mots entiers. Un titre tronqué par le site (« Solo Leveling: Rag… ») est reconnu.
- **Couleur selon l'état du suivi**, celles du site : en cours en bleu, en pause en orange, pas intéressé en rouge, terminé en vert, et gris sans état. Une pastille « ⭐ note 📌 chapitre » suit le titre, et le même texte s'affiche au survol ; seules les valeurs présentes y figurent, et un webtoon sans note ni chapitre n'a ni pastille ni infobulle.
- **Pages qui changent** : le contenu ajouté après le chargement (défilement infini, page suivante sans rechargement) est surligné au fur et à mesure.
- **Rafraîchir** : après un changement sur le site (nouveau suivi, note, chapitre), un bouton recharge la bibliothèque et surligne de nouveau la page.

Le surlignage ne change rien d'autre à la page : les liens fonctionnent toujours, et les champs de saisie ne sont pas touchés.

## Navigateurs

Firefox, Chrome et les autres navigateurs basés sur Chromium, avec un seul code et un seul zip (Manifest V3).

- **Firefox** : depuis son store, avec mises à jour automatiques.
- **Chrome et les autres navigateurs basés sur Chromium** : installation manuelle depuis le zip de la [dernière release](https://github.com/remi-leconte/dramatoons-browser-extension/releases/latest), décrite pas à pas par le [tutoriel du site](https://dramatoons.ovh/install-tutorial). Une extension installée ainsi ne se met pas à jour seule.

## Vie privée et permissions

L'extension ne parle qu'à l'API de Dramatoons. Elle n'envoie rien de la page visitée, ni à Dramatoons ni à un tiers : la page est lue et surlignée dans le navigateur.

| Permission | Pourquoi |
| --- | --- |
| Accès à tous les sites | Surligner les titres sur n'importe quel site. Rien n'est lu tant que l'onglet n'est pas activé. |
| `scripting` | Injecter le surlignage dans un onglet, seulement quand on l'active. |
| `storage` | Garder la session et l'état de chaque onglet dans le navigateur. |
| Accès à l'API de Dramatoons | Se connecter et charger la bibliothèque du lecteur. |

Ce qui est transmis : le login et le mot de passe, à l'API de Dramatoons seulement, à la connexion. L'extension garde ensuite les jetons de session dans le navigateur, jusqu'à la déconnexion. La déconnexion retire le surlignage de tous les onglets et oublie la bibliothèque chargée : celle d'un lecteur ne s'affiche jamais chez un autre.

Si l'accès aux sites est refusé ou retiré dans les réglages du navigateur, la fenêtre le signale et propose de le rendre.

## Limites

- Un titre découpé entre plusieurs éléments de la page (une partie en gras, par exemple) n'est pas reconnu.
- Seul le cadre principal de la page est surligné, pas ses iframes (widget de commentaires, lecteur intégré).
- Un document sans page HTML (fichier SVG ou XML affiché seul) n'est pas surligné.
- Dans la copie d'un élément surligné (carrousel en boucle, carte dupliquée), un titre tronqué est séparé de ses points de suspension : il peut n'être pas surligné, ou l'être comme un webtoon au titre plus court.
- Un élément que le site retire de la page plus d'une minute, puis y remet et réutilise pour un autre texte, peut continuer d'afficher l'ancien texte.
- Un titre fait d'un mot courant (« Love », « Home ») est surligné partout où ce mot apparaît.

## Technologies et architecture

JavaScript sans framework, sans étape de construction ni dépendance à l'exécution, Manifest V3.

- **Arrière-plan** : seul à appeler l'API. Il gère la session (jeton renouvelé seul, un seul renouvellement à la fois), garde la bibliothèque de chaque onglet activé et injecte le surlignage à chaque page chargée, sans nouvel appel à l'API.
- **Script de contenu** : cherche les titres dans le texte de la page et les surligne, puis surveille les modifications de la page. Le retrait du surlignage remet les nœuds de texte d'origine eux-mêmes, pour ne pas casser un site fait avec React ou Vue.
- **Fenêtre** : connexion, interrupteur de l'onglet, rafraîchissement et déconnexion, en passant toujours par l'arrière-plan.

Le détail (organisation du code, messages entre la fenêtre et l'arrière-plan, règles de surlignage) est dans le [`CLAUDE.md`](CLAUDE.md) du dépôt.

## Démarrer en local

Prérequis :
- Docker avec Docker Compose : les commandes `npm` tournent dans un conteneur Node, rien n'est à installer sur le poste ;
- l'[API](https://github.com/remi-leconte/dramatoons-api) lancée en local : dans `src/`, l'extension l'appelle sur http://127.0.0.1:8081 (`src/config.mjs`). Son jeu de données de développement fournit des comptes de test.

```sh
git clone https://github.com/remi-leconte/dramatoons-browser-extension.git
cd dramatoons-browser-extension
docker compose run --rm node npm ci
```

Puis charger le dossier `src/` dans le navigateur :
- **Firefox** : `about:debugging#/runtime/this-firefox`, « Charger un module complémentaire temporaire… », puis choisir `src/manifest.json` ;
- **Chrome et les autres navigateurs basés sur Chromium** : `chrome://extensions`, activer le « Mode développeur », puis « Charger l'extension non empaquetée » et choisir `src/`.

Après une modification, recharger l'extension depuis la même page, puis l'onglet.

## Qualité

- **Tests** : Vitest, sur la session et ses renouvellements, l'activation des onglets, la correspondance des titres, le surlignage et son retrait (y compris les pages qui changent), la fenêtre et la construction du zip de production. Ils tournent dans un DOM simulé (happy-dom), avec une API `chrome` simulée, et ne contactent jamais l'API.
- **Vérifications** : validité du manifeste et des fichiers qu'il référence, syntaxe de chaque fichier JavaScript, et `web-ext lint`, le validateur de Mozilla, sur `src/` et sur la copie de production : tout avertissement fait échouer la CI, sauf celui de la clé `service_worker`, que Firefox ignore volontairement parce qu'elle sert aux navigateurs Chromium.
- **Intégration continue** (GitHub Actions) : vérifications, construction du zip et tests sur chaque pull request. Une relecture par IA relit en plus chaque pull request, en priorité sur la sécurité et les règles métier ; la moindre remarque la bloque.

```sh
docker compose run --rm node npm run ci   # vérifications et construction du zip
docker compose run --rm node npm test     # tests
```

## Livraison

`npm run build` construit le zip de production dans `dist/` : une copie de `src/` qui appelle l'API de production, refusée s'il y reste une adresse du développement. Un tag `vX.Y.Z` posé sur `main` relance les vérifications et les tests, puis joint ce zip à la release GitHub du tag. Le même zip est ensuite envoyé à la main sur le store de Mozilla ; sur Chrome et les autres navigateurs Chromium, il s'installe à la main. Le détail est dans les sections « Zip de production » et « Livraison » du [`CLAUDE.md`](CLAUDE.md).

## Projet Dramatoons

| Dépôt | Rôle |
| --- | --- |
| [dramatoons-api](https://github.com/remi-leconte/dramatoons-api) | API REST (Symfony, API Platform) |
| [dramatoons-front](https://github.com/remi-leconte/dramatoons-front) | Site web (Vue 3, TypeScript) |
| [dramatoons-browser-extension](https://github.com/remi-leconte/dramatoons-browser-extension) | Extension pour Firefox et les navigateurs Chromium (ce dépôt) |
| [dramatoons-workspace](https://github.com/remi-leconte/dramatoons-workspace) | Espace de travail commun : méthode de travail avec Claude Code, règles métier, workflow |

## Licence

[MIT](LICENSE) © 2026 Dramatoons.ovh
