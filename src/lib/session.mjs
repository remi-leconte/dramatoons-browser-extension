import { API_URL } from '../config.mjs'

const ERREUR_SERVEUR = 'Erreur de connexion au serveur.'
const IDENTIFIANTS_INVALIDES = 'Identifiants invalides.'

// Une API qui accepte la connexion sans répondre laisserait la fenêtre vide jusqu'au délai du navigateur :
// au-delà, l'appel échoue comme une panne réseau (erreur, sans déconnexion)
export const DELAI_API_MS = 10_000
const expiration = () => AbortSignal.timeout(DELAI_API_MS)

// Le jeton de renouvellement est à usage unique : deux renouvellements simultanés feraient échouer le second,
// qui déconnecterait l'utilisateur. Les requêtes qui reçoivent un 401 en même temps attendent donc le même
let renouvellementEnCours = null

/**
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function connecter(login, motDePasse) {
  let reponse
  try {
    reponse = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ login, password: motDePasse }),
      signal: expiration(),
    })
  } catch {
    return { ok: false, message: ERREUR_SERVEUR }
  }
  if (reponse.status >= 500) return { ok: false, message: ERREUR_SERVEUR }

  const donnees = await reponse.json().catch(() => ({}))
  if (reponse.ok && donnees.token) {
    await chrome.storage.local.set({ jeton: donnees.token, jetonRenouvellement: donnees.refresh_token ?? null })
    return { ok: true }
  }
  // « Invalid credentials. » est le message anglais par défaut de l'API pour un login ou un mot de passe faux ;
  // ses autres refus (compte désactivé) sont déjà en français
  const message = typeof donnees.message === 'string' && donnees.message !== 'Invalid credentials.'
    ? donnees.message
    : IDENTIFIANTS_INVALIDES
  return { ok: false, message }
}

/** Session présente, sans appel à l'API. */
export async function estConnecte() {
  const { jeton } = await chrome.storage.local.get('jeton')
  return Boolean(jeton)
}

export async function deconnecter() {
  await chrome.storage.local.remove(['jeton', 'jetonRenouvellement'])
}

/**
 * Requête GET authentifiée, renouvelée une fois si le jeton a expiré.
 *
 * @returns {Promise<Response | null>} null si l'utilisateur n'est pas (ou plus) connecté
 */
export async function requete(chemin) {
  const { jeton } = await chrome.storage.local.get('jeton')
  if (!jeton) return null

  const reponse = await appeler(chemin, jeton)
  if (reponse.status !== 401) return reponse

  const nouveauJeton = await renouveler()
  if (!nouveauJeton) return null
  const nouvelleReponse = await appeler(chemin, nouveauJeton)
  if (nouvelleReponse.status === 401) {
    await deconnecter()
    return null
  }
  return nouvelleReponse
}

/**
 * @returns {Promise<{ login: string, total: number } | null>} null si l'utilisateur n'est pas connecté
 */
export async function utilisateur() {
  const reponse = await requete('/me')
  if (!reponse) return null
  if (!reponse.ok) throw new Error(`GET /me : ${reponse.status}`)
  const donnees = await reponse.json()
  return { login: donnees.username, total: donnees.total }
}

function appeler(chemin, jeton) {
  return fetch(`${API_URL}${chemin}`, {
    headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
    signal: expiration(),
  })
}

function renouveler() {
  renouvellementEnCours ??= (async () => {
    try {
      const { jetonRenouvellement } = await chrome.storage.local.get('jetonRenouvellement')
      if (!jetonRenouvellement) {
        await deconnecter()
        return null
      }
      // Une panne réseau ou une API en erreur (5xx) lève une erreur sans déconnecter : la session est peut-être
      // encore valable. Seul un refus de l'API déconnecte
      const reponse = await fetch(`${API_URL}/token/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: jetonRenouvellement }),
        signal: expiration(),
      })
      if (reponse.status >= 500) throw new Error(`POST /token/refresh : ${reponse.status}`)
      const donnees = reponse.ok ? await reponse.json().catch(() => ({})) : {}
      // L'ancien jeton de renouvellement vient d'être consommé : sans le nouveau, la session ne pourrait plus se
      // prolonger, la réponse vaut donc un refus
      if (!donnees.token || !donnees.refresh_token) {
        await deconnecter()
        return null
      }
      await chrome.storage.local.set({ jeton: donnees.token, jetonRenouvellement: donnees.refresh_token })
      return donnees.token
    } finally {
      renouvellementEnCours = null
    }
  })()
  return renouvellementEnCours
}
