import { changerOnglet, ongletActif, oublierOnglet } from './lib/onglets.mjs'
import { connecter, deconnecter, utilisateur } from './lib/session.mjs'

// Seul l'arrière-plan parle à l'API : un seul endroit gère les jetons et leur renouvellement
const actions = {
  connexion: (message) => connecter(message.login, message.motDePasse),
  deconnexion: () => deconnecter(),
  utilisateur: () => utilisateur(),
  etatOnglet: (message) => ongletActif(message.ongletId),
  changerOnglet: (message) => changerOnglet(message.ongletId, message.actif === true),
}

export function traiter(message, expediteur, repondre) {
  if (expediteur.id !== chrome.runtime.id) return false
  const action = actions[message?.type]
  if (!action) return false

  action(message).then(
    (resultat) => repondre({ ok: true, resultat }),
    (erreur) => repondre({ ok: false, erreur: String(erreur?.message ?? erreur) }),
  )
  // Réponse asynchrone : seule forme comprise à la fois par Chrome et par Firefox
  return true
}

chrome.runtime.onMessage.addListener(traiter)
chrome.tabs.onRemoved.addListener((ongletId) => oublierOnglet(ongletId))
