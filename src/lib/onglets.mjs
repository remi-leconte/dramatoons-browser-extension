// storage.session plutôt qu'une variable : sur Chrome et Edge, l'arrière-plan s'endort et perd sa mémoire.
// storage.session est vidé à la fermeture du navigateur, comme l'état des onglets
const cle = (ongletId) => `onglet-${ongletId}`

export async function ongletActif(ongletId) {
  const valeurs = await chrome.storage.session.get(cle(ongletId))
  return valeurs[cle(ongletId)] === true
}

export async function changerOnglet(ongletId, actif) {
  if (actif) await chrome.storage.session.set({ [cle(ongletId)]: true })
  else await chrome.storage.session.remove(cle(ongletId))
}

export async function oublierOnglet(ongletId) {
  await chrome.storage.session.remove(cle(ongletId))
}
