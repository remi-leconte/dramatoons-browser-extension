import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reponse, simulerChrome } from './chrome-simule.js'

let chrome
let traiter

beforeEach(async () => {
  chrome = simulerChrome()
  chrome.runtime.id = 'extension'
  vi.stubGlobal('fetch', vi.fn())
  vi.resetModules()
  ;({ traiter } = await import('../src/background.mjs'))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const envoyer = (message, expediteur = { id: 'extension' }) =>
  new Promise((resoudre) => {
    const asynchrone = traiter(message, expediteur, resoudre)
    if (!asynchrone) resoudre('ignoré')
  })

describe('arrière-plan', () => {
  it('écoute les messages et la fermeture des onglets', () => {
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(traiter)
    expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalledTimes(1)
  })

  it('ignore un message venu d’une autre extension', async () => {
    expect(await envoyer({ type: 'deconnexion' }, { id: 'autre' })).toBe('ignoré')
  })

  it('ignore un message inconnu', async () => {
    expect(await envoyer({ type: 'inconnu' })).toBe('ignoré')
  })

  it('transmet la connexion à la session', async () => {
    fetch.mockResolvedValueOnce(reponse(401, { message: 'Invalid credentials.' }))

    expect(await envoyer({ type: 'connexion', login: 'lecteur', motDePasse: 'faux' })).toEqual({
      ok: true,
      resultat: { ok: false, message: 'Identifiants invalides.' },
    })
  })

  it('renvoie une erreur plutôt que de ne pas répondre', async () => {
    chrome.storage.local.donnees.jeton = 'jeton-1'
    fetch.mockResolvedValueOnce(reponse(500))

    expect(await envoyer({ type: 'utilisateur' })).toEqual({ ok: false, erreur: 'GET /me : 500' })
  })

  it('oublie l’état et la liste d’un onglet à sa fermeture (règle « extension - activation » 4)', async () => {
    Object.assign(chrome.storage.session.donnees, { 'onglet-3': true, 'liste-3': [] })
    const fermeture = chrome.tabs.onRemoved.addListener.mock.calls[0][0]

    await fermeture(3)

    expect(chrome.storage.session.donnees).toEqual({})
  })
})

const API_LISTE = [
  { title: { title: 'Solo Leveling' }, secondaryTitles: {}, userProgress: { state: 'reading', rate: 4, bookmark: 12 } },
]
const LISTE = [{ titrePrincipal: 'Solo Leveling', titres: ['Solo Leveling'], etat: 'reading', note: 4, chapitre: 12 }]

describe('activation d’un onglet (règles « extension - activation » et « liste des webtoons »)', () => {
  beforeEach(() => {
    chrome.storage.local.donnees.jeton = 'jeton-1'
  })

  const injections = () => chrome.scripting.executeScript.mock.calls.map(([options]) => options)
  const messagesPage = () => chrome.tabs.sendMessage.mock.calls

  it('activation : charge la liste une fois, la garde, injecte le surlignage et l’envoie à la page', async () => {
    fetch.mockResolvedValueOnce(reponse(200, API_LISTE))

    expect(await envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })).toEqual({ ok: true, resultat: { actif: true } })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toMatch(/\/webtoons\?mode=ext&pagination=false$/)
    expect(chrome.storage.session.donnees).toEqual({ 'onglet-3': true, 'liste-3': LISTE })
    expect(injections()).toEqual([{ target: { tabId: 3 }, files: ['lib/correspondance.js', 'contenu.js'] }])
    expect(messagesPage()).toEqual([[3, { type: 'surligner', liste: LISTE }]])
    expect(await envoyer({ type: 'etatOnglet', ongletId: 3 })).toEqual({ ok: true, resultat: true })
  })

  it('activation déconnecté : rien n’est activé ni injecté', async () => {
    delete chrome.storage.local.donnees.jeton

    expect(await envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })).toEqual({
      ok: true,
      resultat: { actif: false, deconnecte: true },
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(injections()).toEqual([])
    expect(chrome.storage.session.donnees).toEqual({})
  })

  it('activation sur une page où l’extension ne peut pas s’exécuter : l’onglet reste activé, sans erreur', async () => {
    fetch.mockResolvedValueOnce(reponse(200, API_LISTE))
    chrome.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access contents of the page'))

    expect(await envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })).toEqual({ ok: true, resultat: { actif: true } })
    expect(messagesPage()).toEqual([])
  })

  it('désactivation : retire le surlignage, oublie l’onglet et sa liste, sans appel à l’API', async () => {
    Object.assign(chrome.storage.session.donnees, { 'onglet-3': true, 'liste-3': LISTE })

    expect(await envoyer({ type: 'changerOnglet', ongletId: 3, actif: false })).toEqual({ ok: true, resultat: { actif: false } })

    expect(messagesPage()).toEqual([[3, { type: 'retirer' }]])
    expect(chrome.storage.session.donnees).toEqual({})
    expect(fetch).not.toHaveBeenCalled()
  })

  it('désactivation pendant le chargement de la liste : la désactivation l’emporte', async () => {
    let repondre
    fetch.mockReturnValueOnce(new Promise((resoudre) => (repondre = resoudre)))

    const activation = envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(await envoyer({ type: 'changerOnglet', ongletId: 3, actif: false })).toEqual({ ok: true, resultat: { actif: false } })
    repondre(reponse(200, API_LISTE))

    expect(await activation).toEqual({ ok: true, resultat: { actif: false } })
    expect(chrome.storage.session.donnees).toEqual({})
    expect(injections()).toEqual([])
  })

  it('déconnexion pendant le chargement de la liste : l’onglet n’est pas activé (connexion 6, activation 3)', async () => {
    let repondre
    fetch.mockReturnValueOnce(new Promise((resoudre) => (repondre = resoudre)))

    const activation = envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    await envoyer({ type: 'deconnexion' })
    repondre(reponse(200, API_LISTE))

    expect(await activation).toEqual({ ok: true, resultat: { actif: false } })
    expect(chrome.storage.session.donnees).toEqual({})
    expect(injections()).toEqual([])
  })

  it('déconnexion pendant l’injection du surlignage : la liste n’est pas envoyée à la page', async () => {
    fetch.mockResolvedValueOnce(reponse(200, API_LISTE))
    let injecte
    chrome.scripting.executeScript.mockReturnValueOnce(new Promise((resoudre) => (injecte = resoudre)))

    const activation = envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })
    await vi.waitFor(() => expect(chrome.scripting.executeScript).toHaveBeenCalled())
    await envoyer({ type: 'deconnexion' })
    injecte([])
    await activation

    expect(messagesPage().filter(([, message]) => message.type === 'surligner')).toEqual([])
    expect(chrome.storage.session.donnees).toEqual({})
  })

  it('désactivation pendant l’injection d’une nouvelle page : la liste n’est pas envoyée à la page', async () => {
    Object.assign(chrome.storage.session.donnees, { 'onglet-3': true, 'liste-3': LISTE })
    let injecte
    chrome.scripting.executeScript.mockReturnValueOnce(new Promise((resoudre) => (injecte = resoudre)))
    const chargement = chrome.tabs.onUpdated.addListener.mock.calls[0][0]

    const page = chargement(3, { status: 'complete' })
    await vi.waitFor(() => expect(chrome.scripting.executeScript).toHaveBeenCalled())
    await envoyer({ type: 'changerOnglet', ongletId: 3, actif: false })
    injecte([])
    await page

    expect(messagesPage()).toEqual([[3, { type: 'retirer' }]])
  })

  it('onglet fermé pendant le chargement de sa liste : rien n’est enregistré pour lui', async () => {
    let repondre
    fetch.mockReturnValueOnce(new Promise((resoudre) => (repondre = resoudre)))
    const fermeture = chrome.tabs.onRemoved.addListener.mock.calls[0][0]

    const activation = envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    await fermeture(3)
    repondre(reponse(200, API_LISTE))

    expect(await activation).toEqual({ ok: true, resultat: { actif: false } })
    expect(chrome.storage.session.donnees).toEqual({})
    expect(injections()).toEqual([])
  })

  /** Bloque l'écriture de l'activation dans storage.session, pour faire arriver une action pendant celle-ci. */
  function bloquerEcritureActivation() {
    let liberer
    const ecrire = chrome.storage.session.set.getMockImplementation()
    chrome.storage.session.set.mockImplementationOnce(async (valeurs) => {
      await new Promise((resoudre) => (liberer = resoudre))
      return ecrire(valeurs)
    })
    return () => liberer()
  }

  it('désactivation pendant l’enregistrement de l’activation : l’onglet reste désactivé, sans surlignage', async () => {
    fetch.mockResolvedValueOnce(reponse(200, API_LISTE))
    const liberer = bloquerEcritureActivation()

    const activation = envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })
    await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled())
    await envoyer({ type: 'changerOnglet', ongletId: 3, actif: false })
    liberer()

    expect(await activation).toEqual({ ok: true, resultat: { actif: false } })
    expect(chrome.storage.session.donnees).toEqual({})
    expect(messagesPage().filter(([, message]) => message.type === 'surligner')).toEqual([])
  })

  it('déconnexion pendant l’enregistrement de l’activation : rien ne reste pour un autre compte (connexion 6)', async () => {
    fetch.mockResolvedValueOnce(reponse(200, API_LISTE))
    const liberer = bloquerEcritureActivation()

    const activation = envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })
    await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled())
    await envoyer({ type: 'deconnexion' })
    liberer()

    expect(await activation).toEqual({ ok: true, resultat: { actif: false } })
    expect(chrome.storage.session.donnees).toEqual({})
    expect(messagesPage().filter(([, message]) => message.type === 'surligner')).toEqual([])
  })

  it('désactivation puis réactivation pendant le chargement d’une page : l’ancienne liste n’est jamais envoyée', async () => {
    Object.assign(chrome.storage.session.donnees, { 'onglet-3': true, 'liste-3': LISTE })
    const nouvelleListe = [{ ...API_LISTE[0], title: { title: 'The Boxer' } }]
    // La page lit l'ancienne liste, puis attend : désactivation et réactivation passent pendant ce temps
    let liberer
    const lire = chrome.storage.session.get.getMockImplementation()
    chrome.storage.session.get.mockImplementation(async (cle) => {
      const valeurs = await lire(cle)
      if (cle === 'liste-3' && !liberer) await new Promise((resoudre) => (liberer = resoudre))
      return valeurs
    })
    const chargement = chrome.tabs.onUpdated.addListener.mock.calls[0][0]

    const page = chargement(3, { status: 'complete' })
    await vi.waitFor(() => expect(liberer).toBeDefined())
    await envoyer({ type: 'changerOnglet', ongletId: 3, actif: false })
    fetch.mockResolvedValueOnce(reponse(200, nouvelleListe))
    await envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })
    liberer()
    await page

    const listesEnvoyees = messagesPage()
      .filter(([, message]) => message.type === 'surligner')
      .map(([, message]) => message.liste[0].titrePrincipal)
    expect(listesEnvoyees).toEqual(['The Boxer'])
  })

  it('nouvelle page d’un onglet activé : surlignée avec la liste gardée, sans appel à l’API', async () => {
    Object.assign(chrome.storage.session.donnees, { 'onglet-3': true, 'liste-3': LISTE })
    const chargement = chrome.tabs.onUpdated.addListener.mock.calls[0][0]

    await chargement(3, { status: 'loading' })
    expect(injections()).toEqual([])

    await chargement(3, { status: 'complete' })
    expect(injections()).toEqual([{ target: { tabId: 3 }, files: ['lib/correspondance.js', 'contenu.js'] }])
    expect(messagesPage()).toEqual([[3, { type: 'surligner', liste: LISTE }]])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('nouvelle page d’un onglet désactivé : aucun script, aucun appel à l’API (règle 2)', async () => {
    const chargement = chrome.tabs.onUpdated.addListener.mock.calls[0][0]

    await chargement(4, { status: 'complete' })

    expect(injections()).toEqual([])
    expect(messagesPage()).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
    expect(chrome.storage.local.get).not.toHaveBeenCalled()
  })

  it('nouvelle page d’un onglet resté activé après l’expiration de la session : rien n’est surligné (activation 3)', async () => {
    Object.assign(chrome.storage.session.donnees, { 'onglet-3': true, 'liste-3': LISTE })
    delete chrome.storage.local.donnees.jeton
    const chargement = chrome.tabs.onUpdated.addListener.mock.calls[0][0]

    await chargement(3, { status: 'complete' })

    expect(injections()).toEqual([])
    expect(messagesPage()).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('activation avec une API en erreur : erreur renvoyée, onglet non activé, rien d’injecté', async () => {
    fetch.mockResolvedValueOnce(reponse(500))

    expect(await envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })).toEqual({ ok: false, erreur: 'GET /webtoons : 500' })
    expect(chrome.storage.session.donnees).toEqual({})
    expect(injections()).toEqual([])
  })

  it('activation avec une API injoignable : erreur renvoyée, onglet non activé, rien d’injecté', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    expect((await envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })).ok).toBe(false)
    expect(chrome.storage.session.donnees).toEqual({})
    expect(injections()).toEqual([])
  })

  it('rafraîchir avec une API en erreur : la liste gardée reste la même', async () => {
    Object.assign(chrome.storage.session.donnees, { 'onglet-3': true, 'liste-3': LISTE })
    fetch.mockResolvedValueOnce(reponse(500))

    expect((await envoyer({ type: 'rafraichir', ongletId: 3 })).ok).toBe(false)
    expect(chrome.storage.session.donnees).toEqual({ 'onglet-3': true, 'liste-3': LISTE })
    expect(messagesPage()).toEqual([])
  })

  it('session expirée (renouvellement refusé) : comme une déconnexion, surlignage retiré et onglets oubliés (connexion 4 et 6)', async () => {
    Object.assign(chrome.storage.session.donnees, { 'onglet-3': true, 'liste-3': LISTE, 'onglet-5': true, 'liste-5': LISTE })
    fetch.mockResolvedValueOnce(reponse(401)).mockResolvedValueOnce(reponse(401))

    expect(await envoyer({ type: 'utilisateur' })).toEqual({ ok: true, resultat: null })

    expect(messagesPage()).toEqual([
      [3, { type: 'retirer' }],
      [5, { type: 'retirer' }],
    ])
    expect(chrome.storage.session.donnees).toEqual({})
  })

  it('reconnexion avec un autre compte après une session expirée : la liste du précédent ne s’affiche jamais', async () => {
    Object.assign(chrome.storage.session.donnees, { 'onglet-3': true, 'liste-3': LISTE })
    fetch
      .mockResolvedValueOnce(reponse(401))
      .mockResolvedValueOnce(reponse(401))
      .mockResolvedValueOnce(reponse(200, { token: 'jeton-autre', refresh_token: 'renouvellement-autre' }))
    await envoyer({ type: 'utilisateur' })
    await envoyer({ type: 'connexion', login: 'autre', motDePasse: 'secret' })
    chrome.tabs.sendMessage.mockClear()
    const chargement = chrome.tabs.onUpdated.addListener.mock.calls[0][0]

    await chargement(3, { status: 'complete' })

    expect(messagesPage()).toEqual([])
    expect(await envoyer({ type: 'etatOnglet', ongletId: 3 })).toEqual({ ok: true, resultat: false })
  })

  it('rafraîchir : recharge la liste et surligne de nouveau', async () => {
    Object.assign(chrome.storage.session.donnees, { 'onglet-3': true, 'liste-3': [] })
    fetch.mockResolvedValueOnce(reponse(200, API_LISTE))

    expect(await envoyer({ type: 'rafraichir', ongletId: 3 })).toEqual({ ok: true, resultat: { actif: true } })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(chrome.storage.session.donnees['liste-3']).toEqual(LISTE)
    expect(messagesPage()).toEqual([[3, { type: 'surligner', liste: LISTE }]])
  })

  it('rafraîchir un onglet désactivé ne fait rien', async () => {
    expect(await envoyer({ type: 'rafraichir', ongletId: 3 })).toEqual({ ok: true, resultat: { actif: false } })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('déconnexion : retire le surlignage de tous les onglets activés et les désactive (règle « connexion » 6)', async () => {
    Object.assign(chrome.storage.session.donnees, { 'onglet-3': true, 'liste-3': LISTE, 'onglet-5': true, 'liste-5': LISTE })

    await envoyer({ type: 'deconnexion' })

    expect(messagesPage()).toEqual([
      [3, { type: 'retirer' }],
      [5, { type: 'retirer' }],
    ])
    expect(chrome.storage.session.donnees).toEqual({})
    expect(chrome.storage.local.donnees).toEqual({})
  })
})
