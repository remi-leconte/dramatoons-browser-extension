import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_URL } from '../src/config.mjs'
import { connecter, deconnecter, requete, utilisateur } from '../src/lib/session.mjs'
import { reponse, simulerChrome } from './chrome-simule.js'

let chrome
let fetch

beforeEach(() => {
  chrome = simulerChrome()
  fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const connecte = (jeton = 'jeton-1', jetonRenouvellement = 'renouvellement-1') =>
  Object.assign(chrome.storage.local.donnees, { jeton, jetonRenouvellement })

describe('connexion (règles « extension - connexion » 1 et 2)', () => {
  it('envoie le login et le mot de passe à POST /login et garde les deux jetons', async () => {
    fetch.mockResolvedValueOnce(reponse(200, { token: 'jeton-1', refresh_token: 'renouvellement-1' }))

    expect(await connecter('lecteur', 'secret')).toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledWith(`${API_URL}/login`, expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ login: 'lecteur', password: 'secret' })
    expect(chrome.storage.local.donnees).toEqual({ jeton: 'jeton-1', jetonRenouvellement: 'renouvellement-1' })
  })

  it('affiche le message de l’API pour un compte désactivé', async () => {
    fetch.mockResolvedValueOnce(reponse(401, { code: 401, message: 'Votre compte a été désactivé.' }))

    expect(await connecter('desactive', 'secret')).toEqual({ ok: false, message: 'Votre compte a été désactivé.' })
    expect(chrome.storage.local.donnees).toEqual({})
  })

  it('remplace le message anglais des identifiants faux par « Identifiants invalides. »', async () => {
    fetch.mockResolvedValueOnce(reponse(401, { code: 401, message: 'Invalid credentials.' }))

    expect(await connecter('lecteur', 'faux')).toEqual({ ok: false, message: 'Identifiants invalides.' })
  })

  it('affiche « Identifiants invalides. » quand l’API ne donne pas de message', async () => {
    fetch.mockResolvedValueOnce(reponse(401))

    expect(await connecter('lecteur', 'faux')).toEqual({ ok: false, message: 'Identifiants invalides.' })
  })

  it('affiche « Erreur de connexion au serveur. » si l’API ne répond pas', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    expect(await connecter('lecteur', 'secret')).toEqual({ ok: false, message: 'Erreur de connexion au serveur.' })
  })

  it('affiche « Erreur de connexion au serveur. » si l’API est en erreur', async () => {
    fetch.mockResolvedValueOnce(reponse(502))

    expect(await connecter('lecteur', 'secret')).toEqual({ ok: false, message: 'Erreur de connexion au serveur.' })
  })
})

describe('utilisateur connecté (règle « extension - fenêtre » 3 et 4)', () => {
  it('sans session, ne fait aucun appel à l’API', async () => {
    expect(await utilisateur()).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('donne le login et le nombre de webtoons par un seul appel à GET /me', async () => {
    connecte()
    fetch.mockResolvedValueOnce(reponse(200, { username: 'lecteur', total: 12 }))

    expect(await utilisateur()).toEqual({ login: 'lecteur', total: 12 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/me`, {
      headers: { Authorization: 'Bearer jeton-1', Accept: 'application/json' },
    })
  })

  it('lève une erreur sans déconnecter si l’API ne répond pas (règle « extension - fenêtre » 4)', async () => {
    connecte()
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(utilisateur()).rejects.toThrow()
    expect(chrome.storage.local.donnees).toEqual({ jeton: 'jeton-1', jetonRenouvellement: 'renouvellement-1' })
  })

  it('lève une erreur si l’API répond autre chose qu’un succès ou un 401', async () => {
    connecte()
    fetch.mockResolvedValueOnce(reponse(500))

    await expect(utilisateur()).rejects.toThrow()
    expect(chrome.storage.local.donnees.jeton).toBe('jeton-1')
  })
})

describe('session (règles « extension - connexion » 4 et 5)', () => {
  it('renouvelle un jeton expiré, garde les nouveaux jetons et rejoue la requête', async () => {
    connecte()
    fetch
      .mockResolvedValueOnce(reponse(401, { message: 'Expired JWT Token' }))
      .mockResolvedValueOnce(reponse(200, { token: 'jeton-2', refresh_token: 'renouvellement-2' }))
      .mockResolvedValueOnce(reponse(200, { username: 'lecteur', total: 3 }))

    expect(await utilisateur()).toEqual({ login: 'lecteur', total: 3 })

    expect(fetch.mock.calls[1][0]).toBe(`${API_URL}/token/refresh`)
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ refresh_token: 'renouvellement-1' })
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer jeton-2')
    expect(chrome.storage.local.donnees).toEqual({ jeton: 'jeton-2', jetonRenouvellement: 'renouvellement-2' })
  })

  it('déconnecte si le renouvellement est refusé (session expirée, compte désactivé)', async () => {
    connecte()
    fetch.mockResolvedValueOnce(reponse(401)).mockResolvedValueOnce(reponse(401, { message: 'JWT Refresh Token Not Found' }))

    expect(await utilisateur()).toBeNull()
    expect(chrome.storage.local.donnees).toEqual({})
  })

  it('déconnecte si la requête rejouée est encore refusée', async () => {
    connecte()
    fetch
      .mockResolvedValueOnce(reponse(401))
      .mockResolvedValueOnce(reponse(200, { token: 'jeton-2', refresh_token: 'renouvellement-2' }))
      .mockResolvedValueOnce(reponse(401))

    expect(await requete('/me')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(chrome.storage.local.donnees).toEqual({})
  })

  it('ne lance qu’un renouvellement pour deux requêtes expirées en même temps', async () => {
    connecte()
    fetch.mockImplementation(async (url, options) => {
      if (url.endsWith('/token/refresh')) return reponse(200, { token: 'jeton-2', refresh_token: 'renouvellement-2' })
      return options.headers.Authorization === 'Bearer jeton-2' ? reponse(200, { username: 'lecteur', total: 1 }) : reponse(401)
    })

    const [premier, second] = await Promise.all([requete('/me'), requete('/me')])

    expect(premier.status).toBe(200)
    expect(second.status).toBe(200)
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/token/refresh'))).toHaveLength(1)
  })

  it('ne déconnecte pas si le renouvellement échoue faute de réseau', async () => {
    connecte()
    fetch.mockResolvedValueOnce(reponse(401)).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(requete('/me')).rejects.toThrow()
    expect(chrome.storage.local.donnees).toEqual({ jeton: 'jeton-1', jetonRenouvellement: 'renouvellement-1' })
  })

  it('garde la session dans storage.local, qui survit à la fermeture du navigateur', async () => {
    fetch.mockResolvedValueOnce(reponse(200, { token: 'jeton-1', refresh_token: 'renouvellement-1' }))

    await connecter('lecteur', 'secret')

    expect(chrome.storage.local.set).toHaveBeenCalled()
    expect(chrome.storage.session.set).not.toHaveBeenCalled()
  })
})

describe('déconnexion (règle « extension - connexion » 6)', () => {
  it('efface la session', async () => {
    connecte()

    await deconnecter()

    expect(chrome.storage.local.donnees).toEqual({})
    expect(fetch).not.toHaveBeenCalled()
  })
})
