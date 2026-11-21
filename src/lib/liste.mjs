/**
 * Webtoons de la bibliothèque (GET /webtoons?mode=ext), réduits à ce que le surlignage utilise.
 * `secondaryTitles` arrive en liste ou en objet indexé, et peut contenir le titre principal ;
 * `userProgress` n'a que ses champs remplis, et manque pour un webtoon créé sans être suivi.
 *
 * @returns {{ titrePrincipal: string, titres: string[], etat: string | null, note: number | null, chapitre: number | null }[]}
 */
export function versListe(webtoons) {
  return webtoons.map((webtoon) => {
    const titrePrincipal = webtoon.title?.title ?? ''
    const secondaires = Object.values(webtoon.secondaryTitles ?? {}).map((titre) => titre?.title)
    const titres = [...new Set([titrePrincipal, ...secondaires].filter((titre) => titre && titre.trim()))]
    const suivi = webtoon.userProgress ?? {}
    return {
      titrePrincipal,
      titres,
      etat: suivi.state ?? null,
      note: suivi.rate ?? null,
      // Un chapitre 0 est un chapitre vide (règles de l'API) : rien à afficher
      chapitre: suivi.bookmark ? suivi.bookmark : null,
    }
  })
}
