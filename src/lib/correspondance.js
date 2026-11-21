// Script classique : injecté dans la page avec contenu.js (un script de contenu ne peut pas importer de module).
// Les tests le chargent par import, pour son effet sur globalThis
;(() => {
  const LETTRES_MIN_TRONQUE = 10
  const POINTS_DE_SUSPENSION = /…|\.\.\./g

  /**
   * Texte sans casse, sans accents, ponctuation et espaces réduits à une espace, avec la position de chaque
   * caractère obtenu dans le texte d'origine.
   */
  function normaliser(texte) {
    let normalise = ''
    const positions = []
    for (let i = 0; i < texte.length; i++) {
      const lettres = texte[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
      for (const lettre of lettres) {
        if (/[\p{L}\p{N}]/u.test(lettre)) {
          normalise += lettre
          positions.push(i)
        } else if (normalise.length > 0 && !normalise.endsWith(' ')) {
          normalise += ' '
          positions.push(i)
        }
      }
    }
    if (normalise.endsWith(' ')) {
      normalise = normalise.slice(0, -1)
      positions.pop()
    }
    return { normalise, positions }
  }

  /**
   * Prépare les titres de la bibliothèque : chaque titre normalisé, rangé par premier mot, du plus long au plus court.
   *
   * @param {{ titrePrincipal: string, titres: string[] }[]} webtoons
   */
  function preparer(webtoons) {
    const titres = []
    for (const webtoon of webtoons) {
      for (const titre of webtoon.titres) {
        const { normalise } = normaliser(titre)
        if (normalise) titres.push({ normalise, webtoon })
      }
    }
    titres.sort((a, b) => b.normalise.length - a.normalise.length)
    const parPremierMot = new Map()
    for (const titre of titres) {
      const premierMot = titre.normalise.split(' ')[0]
      if (!parPremierMot.has(premierMot)) parPremierMot.set(premierMot, [])
      parPremierMot.get(premierMot).push(titre)
    }
    return { titres, parPremierMot }
  }

  const ordreAlphabetique = (a, b) => a.titrePrincipal.localeCompare(b.titrePrincipal, 'fr', { sensitivity: 'base' })

  /**
   * Titre tronqué juste avant des points de suspension : la fin du segment est le début d'un titre plus long.
   * Le segment commence au début du texte ou après les points de suspension précédents.
   */
  function chercherTronque(segment, prepares) {
    const { normalise, positions } = normaliser(segment)
    for (let debut = 0; debut < normalise.length; debut++) {
      if (debut > 0 && normalise[debut - 1] !== ' ') continue
      const extrait = normalise.slice(debut)
      if (extrait.replaceAll(' ', '').length < LETTRES_MIN_TRONQUE) return null
      const candidats = prepares.titres
        .filter((titre) => titre.normalise.length > extrait.length && titre.normalise.startsWith(extrait))
        .map((titre) => titre.webtoon)
      if (candidats.length > 0) {
        return {
          debut: positions[debut],
          fin: positions[normalise.length - 1] + 1,
          webtoon: [...candidats].sort(ordreAlphabetique)[0],
        }
      }
    }
    return null
  }

  /**
   * Titres trouvés dans un texte, sans chevauchement, de gauche à droite.
   *
   * @returns {{ debut: number, fin: number, webtoon: object }[]} positions dans le texte d'origine
   */
  function chercher(texte, prepares) {
    // Titres tronqués d'abord, devant chaque « … » ou « ... » : « Solo Leveling: Rag… » doit désigner
    // « Solo Leveling : Ragnarok » et non le titre complet « Solo Leveling » qu'il contient
    const tronques = []
    let debutSegment = 0
    for (const points of texte.matchAll(POINTS_DE_SUSPENSION)) {
      const trouve = chercherTronque(texte.slice(debutSegment, points.index), prepares)
      if (trouve) tronques.push({ ...trouve, debut: trouve.debut + debutSegment, fin: trouve.fin + debutSegment })
      debutSegment = points.index + points[0].length
    }
    const libre = (debut, fin) => tronques.every((tronque) => fin <= tronque.debut || debut >= tronque.fin)

    // Titres complets, hors des titres tronqués (un titre peut contenir « ... ») : à chaque début de mot,
    // le plus long titre qui finit sur une fin de mot
    const { normalise, positions } = normaliser(texte)
    const complets = []
    let curseur = 0
    for (let debut = 0; debut < normalise.length; debut++) {
      if (debut < curseur || (debut > 0 && normalise[debut - 1] !== ' ')) continue
      const premierMot = normalise.slice(debut).split(' ')[0]
      for (const titre of prepares.parPremierMot.get(premierMot) ?? []) {
        const fin = debut + titre.normalise.length
        if (fin < normalise.length && normalise[fin] !== ' ') continue
        if (!normalise.startsWith(titre.normalise, debut)) continue
        const trouve = { debut: positions[debut], fin: positions[fin - 1] + 1, webtoon: titre.webtoon }
        if (!libre(trouve.debut, trouve.fin)) continue
        complets.push(trouve)
        curseur = fin
        break
      }
    }
    return [...complets, ...tronques].sort((a, b) => a.debut - b.debut)
  }

  globalThis.DramatoonsCorrespondance = { normaliser, preparer, chercher }
})()
