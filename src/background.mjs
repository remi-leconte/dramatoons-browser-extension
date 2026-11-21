import { versListe } from './lib/liste.mjs'
import {
  activerOnglet,
  dejaSurligne,
  listeOnglet,
  marquerSurligne,
  ongletActif,
  ongletsActifs,
  oublierMarque,
  oublierOnglet,
} from './lib/onglets.mjs'
import { SCRIPTS_INJECTES } from './lib/scripts-injectes.mjs'
import { connecter, deconnecter, estConnecte, requete, surDeconnexion, utilisateur } from './lib/session.mjs'

/** @returns {Promise<object[] | null>} null si l'utilisateur n'est pas (ou plus) connecté */
async function chargerListe() {
  const reponse = await requete('/webtoons?mode=ext&pagination=false')
  if (!reponse) return null
  if (!reponse.ok) throw new Error(`GET /webtoons : ${reponse.status}`)
  return versListe(await reponse.json())
}

// Dernière demande de chaque onglet : le chargement de la liste peut durer, et une désactivation, une
// déconnexion ou une fermeture arrivée entre-temps doit l'emporter sur l'activation en cours
const demandes = new Map()
// Numéro courant, créé à la première lecture : après une mise en veille de l'arrière-plan, la table est vide, et
// un onglet sans entrée doit pouvoir être comparé (une fermeture retire l'entrée, ce qui se voit)
const demandeCourante = (ongletId) => {
  if (!demandes.has(ongletId)) demandes.set(ongletId, 0)
  return demandes.get(ongletId)
}
const nouvelleDemande = (ongletId) => {
  const numero = (demandes.get(ongletId) ?? 0) + 1
  demandes.set(ongletId, numero)
  return numero
}

// Une page où l'extension ne peut pas s'exécuter (page interne du navigateur, store) n'est simplement pas surlignée.
// Une désactivation, une déconnexion ou une fermeture arrivée pendant l'injection l'emporte : son « retirer » a pu
// se perdre avant que la page écoute, la liste n'est donc envoyée que si l'onglet est toujours activé
async function surligner(ongletId, liste, demande) {
  try {
    await chrome.scripting.executeScript({ target: { tabId: ongletId }, files: SCRIPTS_INJECTES })
    const toujoursActif = demandes.get(ongletId) === demande && (await ongletActif(ongletId)) && (await estConnecte())
    if (!toujoursActif) return
    await chrome.tabs.sendMessage(ongletId, { type: 'surligner', liste })
    await marquerSurligne(ongletId)
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

/** Active (liste chargée puis page surlignée) ou désactive un onglet. */
async function changerOnglet(ongletId, actif) {
  if (!actif) {
    nouvelleDemande(ongletId)
    await oublierOnglet(ongletId)
    await retirer(ongletId)
    return { actif: false }
  }
  // L'activation ne prend son numéro qu'une fois la liste reçue : un chargement qui échoue (API en erreur)
  // n'annule pas le surlignage d'une page en cours. Une désactivation, une déconnexion ou une fermeture pendant
  // le chargement change le numéro vu au départ
  const vu = demandeCourante(ongletId)
  const liste = await chargerListe()
  if (!liste) return { actif: false, deconnecte: true }
  if (demandes.get(ongletId) !== vu || !(await estConnecte())) return { actif: await ongletActif(ongletId) }
  const demande = nouvelleDemande(ongletId)
  const encoreValable = async () => demandes.get(ongletId) === demande && (await estConnecte())
  await activerOnglet(ongletId, liste)
  // Une désactivation ou une déconnexion a pu passer pendant l'écriture, sans voir cet onglet : on l'annule
  if (!(await encoreValable())) {
    await oublierOnglet(ongletId)
    await retirer(ongletId)
    return { actif: false }
  }
  await surligner(ongletId, liste, demande)
  return { actif: true }
}

async function rafraichir(ongletId) {
  if (!(await ongletActif(ongletId))) return { actif: false }
  return changerOnglet(ongletId, true)
}

// Fin de session, demandée ou due à un renouvellement refusé (session.mjs) : surlignage retiré et onglets
// désactivés partout, et toute activation en cours abandonnée
async function oublierTousLesOnglets() {
  for (const ongletId of demandes.keys()) nouvelleDemande(ongletId)
  for (const ongletId of await ongletsActifs()) {
    await oublierOnglet(ongletId)
    await retirer(ongletId)
  }
}

surDeconnexion(oublierTousLesOnglets)

// Seul l'arrière-plan parle à l'API : un seul endroit gère les jetons et leur renouvellement
const actions = {
  connexion: (message) => connecter(message.login, message.motDePasse),
  deconnexion: () => deconnecter(),
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

// Nouvelle page dans un onglet activé : surlignée avec la liste déjà chargée, sans appel à l'API.
// Dans un onglet qui n'est plus activé (ou sans session), une page déjà surlignée peut revenir du cache de
// navigation (« Précédent ») avec l'ancienne liste : elle reçoit « retirer », sans injection ni appel à l'API.
// Un onglet jamais surligné ne reçoit rien
export async function pageChargee(ongletId, changement) {
  const demande = demandeCourante(ongletId)
  if (changement.status !== 'complete') return
  if ((await ongletActif(ongletId)) && (await estConnecte())) {
    const liste = await listeOnglet(ongletId)
    if (liste) await surligner(ongletId, liste, demande)
  } else if (await dejaSurligne(ongletId)) {
    await retirer(ongletId)
  }
}

chrome.runtime.onMessage.addListener(traiter)
chrome.tabs.onUpdated.addListener(pageChargee)
// Onglet fermé : une activation en cours pour lui n'enregistre rien (sa demande n'existe plus)
chrome.tabs.onRemoved.addListener(async (ongletId) => {
  demandes.delete(ongletId)
  await oublierOnglet(ongletId)
  await oublierMarque(ongletId)
})
