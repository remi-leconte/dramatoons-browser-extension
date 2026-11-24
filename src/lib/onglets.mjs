// storage.session plutôt qu'une variable : sur les navigateurs Chromium, l'arrière-plan s'endort et perd sa mémoire.
// storage.session est vidé à la fermeture du navigateur, comme l'état des onglets
const cleEtat = (ongletId) => `onglet-${ongletId}`
const cleListe = (ongletId) => `liste-${ongletId}`

export async function ongletActif(ongletId) {
  const valeurs = await chrome.storage.session.get(cleEtat(ongletId))
  return valeurs[cleEtat(ongletId)] === true
}

/** Active l'onglet avec sa liste de webtoons, chargée à l'activation et gardée pour ses pages suivantes. */
export async function activerOnglet(ongletId, liste) {
  await chrome.storage.session.set({ [cleEtat(ongletId)]: true, [cleListe(ongletId)]: liste })
}

export async function listeOnglet(ongletId) {
  const valeurs = await chrome.storage.session.get(cleListe(ongletId))
  return valeurs[cleListe(ongletId)] ?? null
}

export async function oublierOnglet(ongletId) {
  await chrome.storage.session.remove([cleEtat(ongletId), cleListe(ongletId)])
}

// Onglet qui a reçu une liste au moins une fois : ses pages en cache (« Précédent ») peuvent revenir surlignées.
// La marque survit à la désactivation et ne disparaît qu'à la fermeture de l'onglet
const cleMarque = (ongletId) => `surligne-${ongletId}`

export async function marquerSurligne(ongletId) {
  await chrome.storage.session.set({ [cleMarque(ongletId)]: true })
}

export async function dejaSurligne(ongletId) {
  const valeurs = await chrome.storage.session.get(cleMarque(ongletId))
  return valeurs[cleMarque(ongletId)] === true
}

export async function oublierMarque(ongletId) {
  await chrome.storage.session.remove(cleMarque(ongletId))
}

export async function ongletsActifs() {
  const valeurs = await chrome.storage.session.get(null)
  return Object.keys(valeurs)
    .filter((cle) => cle.startsWith('onglet-') && valeurs[cle] === true)
    .map((cle) => Number(cle.slice('onglet-'.length)))
}
