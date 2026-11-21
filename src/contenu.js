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

  // !important : une feuille de style de la page ne doit pas rendre le surlignage illisible
  const styler = (element, styles) => {
    for (const [propriete, valeur] of Object.entries(styles)) element.style.setProperty(propriete, valeur, 'important')
  }

  const informations = (webtoon) =>
    [webtoon.note != null ? `⭐ ${webtoon.note}` : '', webtoon.chapitre != null ? `📌 ${webtoon.chapitre}` : '']
      .filter(Boolean)
      .join(' ')

  function ignore(noeud) {
    for (let element = noeud.parentElement; element; element = element.parentElement) {
      if (IGNORES.has(element.tagName) || element.isContentEditable) return true
      if (element.classList.contains(CLASSE_TITRE) || element.classList.contains(CLASSE_PASTILLE)) return true
    }
    return false
  }

  function noeudsTexte(racine) {
    const parcours = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT)
    const noeuds = []
    for (let noeud = parcours.nextNode(); noeud; noeud = parcours.nextNode()) {
      if (noeud.nodeValue.trim() && !ignore(noeud)) noeuds.push(noeud)
    }
    return noeuds
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
    noeud.replaceWith(fragment)
  }

  function retirer() {
    for (const pastille of document.querySelectorAll(`.${CLASSE_PASTILLE}`)) pastille.remove()
    for (const titre of document.querySelectorAll(`.${CLASSE_TITRE}`)) {
      const parent = titre.parentNode
      titre.replaceWith(titre.textContent)
      parent?.normalize()
    }
  }

  function surligner(liste) {
    retirer()
    const prepares = globalThis.DramatoonsCorrespondance.preparer(liste)
    for (const noeud of noeudsTexte(document.body)) surlignerNoeud(noeud, prepares)
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'surligner') surligner(message.liste)
    else if (message?.type === 'retirer') retirer()
  })

  globalThis.DramatoonsSurlignage = { surligner, retirer }
})()
