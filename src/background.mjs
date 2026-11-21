import { versListe } from './lib/liste.mjs'
import { activerOnglet, listeOnglet, ongletActif, ongletsActifs, oublierOnglet } from './lib/onglets.mjs'
import { connecter, deconnecter, estConnecte, requete, utilisateur } from './lib/session.mjs'

/** @returns {Promise<object[] | null>} null si l'utilisateur n'est pas (ou plus) connecté */
async function chargerListe() {
  const reponse = await requete('/webtoons?mode=ext&pagination=false')
  if (!reponse) return null
  if (!reponse.ok) throw new Error(`GET /webtoons : ${reponse.status}`)
  return versListe(await reponse.json())
}

// Une page où l'extension ne peut pas s'exécuter (page interne du navigateur, store) n'est simplement pas surlignée
async function surligner(ongletId, liste) {
  try {
    await chrome.scripting.executeScript({ target: { tabId: ongletId }, files: ['lib/correspondance.js', 'contenu.js'] })
    await chrome.tabs.sendMessage(ongletId, { type: 'surligner', liste })
  } catch {
    // rien à surligner sur cette page
  }
}

async function retirer(ongletId) {
  try {
    await chrome.tabs.sendMessage(ongletId, { type: 'retirer' })
  } catch {
    // page sans script de surlignage (déjà changée, ou jamais surlignée)
  }
}

// Dernière demande de chaque onglet : le chargement de la liste peut durer, et une désactivation ou une
// déconnexion arrivée entre-temps doit l'emporter sur l'activation en cours
const demandes = new Map()
const nouvelleDemande = (ongletId) => {
  const numero = (demandes.get(ongletId) ?? 0) + 1
  demandes.set(ongletId, numero)
  return numero
}

/** Active (liste chargée puis page surlignée) ou désactive un onglet. */
async function changerOnglet(ongletId, actif) {
  const demande = nouvelleDemande(ongletId)
  if (!actif) {
    await oublierOnglet(ongletId)
    await retirer(ongletId)
    return { actif: false }
  }
  const liste = await chargerListe()
  if (!liste) return { actif: false, deconnecte: true }
  if (demandes.get(ongletId) !== demande || !(await estConnecte())) return { actif: await ongletActif(ongletId) }
  await activerOnglet(ongletId, liste)
  await surligner(ongletId, liste)
  return { actif: true }
}

async function rafraichir(ongletId) {
  if (!(await ongletActif(ongletId))) return { actif: false }
  return changerOnglet(ongletId, true)
}

async function deconnexion() {
  for (const ongletId of demandes.keys()) nouvelleDemande(ongletId)
  for (const ongletId of await ongletsActifs()) {
    await oublierOnglet(ongletId)
    await retirer(ongletId)
  }
  await deconnecter()
}

// Seul l'arrière-plan parle à l'API : un seul endroit gère les jetons et leur renouvellement
const actions = {
  connexion: (message) => connecter(message.login, message.motDePasse),
  deconnexion: () => deconnexion(),
  utilisateur: () => utilisateur(),
  etatOnglet: (message) => ongletActif(message.ongletId),
  changerOnglet: (message) => changerOnglet(message.ongletId, message.actif === true),
  rafraichir: (message) => rafraichir(message.ongletId),
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

// Nouvelle page dans un onglet activé : surlignée avec la liste déjà chargée, sans appel à l'API. Une session
// expirée entre-temps (renouvellement refusé) ne surligne plus rien : l'onglet attend la reconnexion
export async function pageChargee(ongletId, changement) {
  if (changement.status !== 'complete' || !(await ongletActif(ongletId)) || !(await estConnecte())) return
  const liste = await listeOnglet(ongletId)
  if (liste) await surligner(ongletId, liste)
}

chrome.runtime.onMessage.addListener(traiter)
chrome.tabs.onUpdated.addListener(pageChargee)
chrome.tabs.onRemoved.addListener((ongletId) => oublierOnglet(ongletId))
