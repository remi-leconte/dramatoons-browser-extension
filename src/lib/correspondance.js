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
    const caracteres = []
    const positions = []
    let espace = false
    const ajouter = (lettre, position) => {
      if (espace && caracteres.length > 0) {
        caracteres.push(' ')
        positions.push(position)
      }
      espace = false
      caracteres.push(lettre)
      positions.push(position)
    }
    for (let i = 0; i < texte.length; i++) {
      const code = texte.charCodeAt(i)
      // Chemin rapide pour l'ASCII, l'essentiel d'une page : la décomposition Unicode coûte cher sur un long texte
      if (code < 128) {
        if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) ajouter(texte[i], i)
        else if (code >= 65 && code <= 90) ajouter(String.fromCharCode(code + 32), i)
        else espace = true
        continue
      }
      for (const lettre of texte[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()) {
        if (/[\p{L}\p{N}]/u.test(lettre)) ajouter(lettre, i)
        else espace = true
      }
    }
    return { normalise: caracteres.join(''), positions }
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
    const longueurMax = titres.length > 0 ? titres[0].normalise.length : 0
    return { titres, parPremierMot, longueurMax }
  }

  const ordreAlphabetique = (a, b) => a.titrePrincipal.localeCompare(b.titrePrincipal, 'fr', { sensitivity: 'base' })

  /**
   * Titre tronqué juste avant des points de suspension : la fin du segment est le début d'un titre plus long.
   * Le segment commence au début du texte ou après les points de suspension précédents.
   */
  function chercherTronque(segment, prepares) {
    const { normalise, positions } = normaliser(segment)
    // Un extrait plus long que le plus long titre ne peut pas en être le début : seule la fin d'un long segment
    // est examinée, ce qui garde la recherche linéaire sur un texte de plusieurs milliers de mots
    for (let debut = Math.max(0, normalise.length - prepares.longueurMax); debut < normalise.length; debut++) {
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
    // Titres complets : à chaque début de mot, le plus long titre qui finit sur une fin de mot
    const { normalise, positions } = normaliser(texte)
    const candidats = []
    for (let debut = 0; debut < normalise.length; debut++) {
      if (debut > 0 && normalise[debut - 1] !== ' ') continue
      const espace = normalise.indexOf(' ', debut)
      const premierMot = normalise.slice(debut, espace === -1 ? normalise.length : espace)
      const titre = (prepares.parPremierMot.get(premierMot) ?? []).find((titre) => {
        const fin = debut + titre.normalise.length
        return (fin === normalise.length || normalise[fin] === ' ') && normalise.startsWith(titre.normalise, debut)
      })
      if (titre) candidats.push({ debut, fin: debut + titre.normalise.length, webtoon: titre.webtoon })
    }
    // Une seule sélection pour les complets et les tronqués, en positions du texte d'origine : le plus long dans la
    // page l'emporte sur ceux qu'il chevauche (règle 6), le tronqué à égalité (il désigne un titre plus long), puis
    // le plus à gauche ; un titre écarté par un autre lui-même écarté reste donc possible
    const tous = [
      ...candidats.map((c) => ({ debut: positions[c.debut], fin: positions[c.fin - 1] + 1, webtoon: c.webtoon, tronque: false })),
      ...tronques.map((t) => ({ ...t, tronque: true })),
    ]
    tous.sort((a, b) => b.fin - b.debut - (a.fin - a.debut) || Number(b.tronque) - Number(a.tronque) || a.debut - b.debut)
    const occupe = new Uint8Array(texte.length)
    const gardes = []
    for (const trouve of tous) {
      if (occupe.subarray(trouve.debut, trouve.fin).some(Boolean)) continue
      occupe.fill(1, trouve.debut, trouve.fin)
      gardes.push({ debut: trouve.debut, fin: trouve.fin, webtoon: trouve.webtoon })
    }
    return gardes.sort((a, b) => a.debut - b.debut)
  }

  globalThis.DramatoonsCorrespondance = { normaliser, preparer, chercher }
})()
