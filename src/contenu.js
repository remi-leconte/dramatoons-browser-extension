// Script de contenu, injecté par l'arrière-plan seulement dans un onglet activé, après lib/correspondance.js.
// Une nouvelle injection dans la même page (rafraîchissement) réutilise l'écouteur déjà en place
;(() => {
  if (globalThis.DramatoonsSurlignage) return

  const COULEURS = {
    reading: 'rgba(33, 150, 243, 0.9)',
    pause: 'rgba(255, 152, 0, 0.9)',
    break: 'rgba(229, 9, 20, 0.9)',
    completed: 'rgba(76, 175, 80, 0.9)',
  }
  const SANS_ETAT = 'rgba(85, 85, 85, 0.9)'
  const CLASSE_TITRE = 'dramatoons-titre'
  const CLASSE_PASTILLE = 'dramatoons-pastille'
  const IGNORES = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'TEMPLATE'])

  // Chaque nœud de texte remplacé, avec ce qui l'a remplacé : le retrait remet le nœud d'origine lui-même. Un site
  // construit par un framework (React, Vue) garde des références vers ses nœuds de texte, qui doivent rester les mêmes
  const remplacements = new Map()
  // Le nœud d'origine de chaque morceau
  const origines = new WeakMap()
  const suivi = (morceau) => remplacements.has(origines.get(morceau))
  // Moment où les morceaux d'un nœud d'origine ont été vus hors de la page pour la première fois
  const sorties = new Map()

  // !important : une feuille de style de la page ne doit pas rendre le surlignage illisible
  const styler = (element, styles) => {
    for (const [propriete, valeur] of Object.entries(styles)) element.style.setProperty(propriete, valeur, 'important')
  }

  const informations = (webtoon) =>
    [webtoon.note != null ? `⭐ ${webtoon.note}` : '', webtoon.chapitre != null ? `📌 ${webtoon.chapitre}` : '']
      .filter(Boolean)
      .join(' ')

  const HTML = 'http://www.w3.org/1999/xhtml'

  function ignore(noeud) {
    for (let element = noeud.parentElement; element; element = element.parentElement) {
      // Hors HTML (SVG, MathML), un <span> ne s'afficherait pas : le texte disparaîtrait du dessin
      if (element.namespaceURI !== HTML) return true
      if (IGNORES.has(element.tagName) || element.isContentEditable) return true
      if (element.classList.contains(CLASSE_TITRE) || element.classList.contains(CLASSE_PASTILLE)) return true
    }
    return false
  }

  function noeudsTexte(racine) {
    const parcours = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT)
    const noeuds = []
    for (let noeud = parcours.nextNode(); noeud; noeud = parcours.nextNode()) {
      // Un morceau déjà suivi (élément déplacé par le site) a été trouvé sur le texte entier : le relire seul pourrait
      // donner une autre sélection
      if (noeud.nodeValue.trim() && !ignore(noeud) && !suivi(noeud)) noeuds.push(noeud)
    }
    return noeuds
  }

  // Copie d'un élément surligné (carrousel en boucle, carte dupliquée) : ses titres et pastilles ne sont pas suivis, et
  // ne seraient ni retirés à la désactivation ni mis à jour. Ils redeviennent du texte, surligné de nouveau ensuite
  function defaireCopies(racine) {
    const copies = [...racine.querySelectorAll(`.${CLASSE_TITRE}, .${CLASSE_PASTILLE}`)]
    if (racine.matches(`.${CLASSE_TITRE}, .${CLASSE_PASTILLE}`)) copies.unshift(racine)
    const parents = new Set()
    for (const copie of copies) {
      if (suivi(copie) || !copie.parentNode) continue
      parents.add(copie.parentNode)
      if (copie.classList.contains(CLASSE_PASTILLE)) copie.remove()
      else copie.replaceWith(copie.textContent)
    }
    // Les textes séparés par la copie sont réunis, pour être cherchés en entier ; seulement dans la copie, et sans
    // morceau suivi : un framework peut garder des références vers les nœuds de texte de la page
    for (const parent of parents) {
      if (racine.contains(parent) && ![...parent.childNodes].some(suivi)) parent.normalize()
    }
  }

  function surlignerNoeud(noeud, prepares) {
    const texte = noeud.nodeValue
    const trouves = globalThis.DramatoonsCorrespondance.chercher(texte, prepares)
    if (trouves.length === 0) return

    const fragment = document.createDocumentFragment()
    let position = 0
    for (const { debut, fin, webtoon } of trouves) {
      if (debut > position) fragment.append(texte.slice(position, debut))
      const titre = document.createElement('span')
      titre.className = CLASSE_TITRE
      titre.textContent = texte.slice(debut, fin)
      styler(titre, { background: COULEURS[webtoon.etat] ?? SANS_ETAT, color: '#fff', cursor: 'help' })
      const infos = informations(webtoon)
      if (infos) titre.title = infos
      fragment.append(titre)
      if (infos) {
        const pastille = document.createElement('span')
        pastille.className = CLASSE_PASTILLE
        pastille.textContent = infos
        styler(pastille, {
          background: '#fff',
          color: '#000',
          'border-radius': '30px',
          padding: '2px 6px',
          'margin-left': '4px',
          'font-size': '16px',
          display: 'inline-block',
        })
        fragment.append(pastille)
      }
      position = fin
    }
    if (position < texte.length) fragment.append(texte.slice(position))
    const morceaux = [...fragment.childNodes]
    for (const morceau of morceaux) origines.set(morceau, noeud)
    remplacements.set(noeud, morceaux)
    noeud.replaceWith(fragment)
  }

  function oublier(origine) {
    remplacements.delete(origine)
    sorties.delete(origine)
  }

  function restituer(origine) {
    const morceaux = remplacements.get(origine)
    oublier(origine)
    // Le nœud d'origine reprend la place du premier morceau qui a encore un parent, même hors de la page : le site
    // peut remettre cet élément plus tard. Si le site a jeté tous les morceaux, rien n'est remis
    morceaux.find((morceau) => morceau.parentNode)?.before(origine)
    for (const morceau of morceaux) morceau.remove()
  }

  // Contenu ajouté ou modifié après le surlignage (défilement infini, page suivante sans rechargement, éléments
  // recyclés) : les modifications sont regroupées et traitées après DELAI_MS sans nouvelle modification, en ne
  // relisant que les textes concernés. DELAI_MAX_MS plafonne l'attente : une page qui change sans arrêt (compteur,
  // lecteur vidéo) repousserait sinon le traitement indéfiniment
  const DELAI_MS = 300
  const DELAI_MAX_MS = 1000
  const OUBLI_MS = 60_000
  let prepares = null
  let observateur = null
  let minuterie = null
  let plafond = null
  const enAttente = new Set()

  function annulerMinuteries() {
    clearTimeout(minuterie)
    clearTimeout(plafond)
    minuterie = null
    plafond = null
  }

  function observer() {
    // <html> plutôt que <body> : certains sites remplacent tout le <body> pour afficher la page suivante
    observateur.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    // Un framework qui recycle un élément modifie le nœud d'origine, sorti de la page : sans cela, l'ancien titre
    // surligné resterait affiché à la place du nouveau texte
    for (const origine of remplacements.keys()) observateur.observe(origine, { characterData: true })
  }

  function traiterEnAttente() {
    annulerMinuteries()
    // Les modifications faites ici par l'extension ne doivent pas relancer un traitement
    observateur.disconnect()
    for (const noeud of enAttente) {
      if (remplacements.has(noeud)) restituer(noeud)
      // Hors du <body> (<head>, <title>), le texte ne s'affiche pas
      if (!document.body?.contains(noeud)) continue
      if (noeud.nodeType === Node.TEXT_NODE) {
        if (noeud.nodeValue.trim() && !ignore(noeud) && !suivi(noeud)) surlignerNoeud(noeud, prepares)
      } else {
        defaireCopies(noeud)
        for (const texte of noeudsTexte(noeud)) surlignerNoeud(texte, prepares)
      }
    }
    enAttente.clear()
    // Morceaux tous retirés par le site : il a jeté ce texte, et ne le remettra pas. Un morceau dont seul un ancêtre
    // est sorti de la page garde son parent : le site peut remettre cet ancêtre, mais au-delà de OUBLI_MS hors de la
    // page, l'entrée est oubliée, pour que la mémoire et le coût de chaque traitement ne grandissent pas sans fin
    const maintenant = Date.now()
    for (const [origine, morceaux] of remplacements) {
      if (morceaux.every((morceau) => !morceau.parentNode)) oublier(origine)
      else if (morceaux.some((morceau) => morceau.isConnected)) sorties.delete(origine)
      else if (!sorties.has(origine)) sorties.set(origine, maintenant)
      else if (maintenant - sorties.get(origine) >= OUBLI_MS) oublier(origine)
    }
    observer()
  }

  function surveiller() {
    observateur = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') enAttente.add(mutation.target)
        else for (const ajoute of mutation.addedNodes) enAttente.add(ajoute)
      }
      if (enAttente.size === 0) return
      clearTimeout(minuterie)
      minuterie = setTimeout(traiterEnAttente, DELAI_MS)
      plafond ??= setTimeout(traiterEnAttente, DELAI_MAX_MS)
    })
    observer()
  }

  function arreterSurveillance() {
    observateur?.disconnect()
    observateur = null
    annulerMinuteries()
    enAttente.clear()
  }

  function retirer() {
    arreterSurveillance()
    for (const origine of [...remplacements.keys()].reverse()) restituer(origine)
  }

  function surligner(liste) {
    retirer()
    // Document sans <body> (fichier SVG ou XML ouvert directement) : rien à surligner
    if (!document.body) return
    prepares = globalThis.DramatoonsCorrespondance.preparer(liste)
    for (const noeud of noeudsTexte(document.body)) surlignerNoeud(noeud, prepares)
    surveiller()
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'surligner') surligner(message.liste)
    else if (message?.type === 'retirer') retirer()
  })

  globalThis.DramatoonsSurlignage = { surligner, retirer, DELAI_MS, DELAI_MAX_MS, OUBLI_MS }
})()
