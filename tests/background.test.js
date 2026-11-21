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

  it('change et lit l’état d’un onglet', async () => {
    expect(await envoyer({ type: 'changerOnglet', ongletId: 3, actif: true })).toEqual({ ok: true })
    expect(await envoyer({ type: 'etatOnglet', ongletId: 3 })).toEqual({ ok: true, resultat: true })
  })

  it('oublie l’état d’un onglet à sa fermeture (règle « extension - activation » 4)', async () => {
    chrome.storage.session.donnees['onglet-3'] = true
    const fermeture = chrome.tabs.onRemoved.addListener.mock.calls[0][0]

    await fermeture(3)

    expect(chrome.storage.session.donnees).toEqual({})
  })
})
