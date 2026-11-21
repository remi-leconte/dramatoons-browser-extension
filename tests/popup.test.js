// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialiser } from '../src/popup.mjs'
import { simulerChrome } from './chrome-simule.js'

// Le corps seul, sans son script : happy-dom ne charge ni la feuille de style ni les modules de la page
const corps = readFileSync('src/popup.html', 'utf8')
  .split(/<body>|<\/body>/)[1]
  .replace(/<script[^>]*><\/script>/g, '')

let chrome
let reponses

beforeEach(() => {
  chrome = simulerChrome()
  document.body.innerHTML = corps
  // Réponses de l'arrière-plan, par type de message ; une fonction reçoit le message
  reponses = { utilisateur: null, etatOnglet: false }
  chrome.runtime.sendMessage.mockImplementation(async (message) => {
    const reponse = reponses[message.type]
    if (reponse instanceof Error) return { ok: false, erreur: reponse.message }
    return { ok: true, resultat: typeof reponse === 'function' ? reponse(message) : reponse }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const element = (id) => document.getElementById(id)
const visibles = () => ['erreurServeur', 'deconnecte', 'connecte'].filter((id) => !element(id).hidden)
const attendre = () => new Promise((resoudre) => setTimeout(resoudre))

async function seConnecter(login, motDePasse) {
  element('login').value = login
  element('motDePasse').value = motDePasse
  element('formulaireConnexion').dispatchEvent(new Event('submit', { cancelable: true }))
  await attendre()
}

describe('fenêtre (règles « extension - fenêtre »)', () => {
  it('le logo et « Dramatoons » ouvrent le site dans un nouvel onglet', () => {
    const lien = document.querySelector('a.header-link')

    expect(lien.getAttribute('href')).toBe('https://dramatoons.ovh')
    expect(lien.getAttribute('target')).toBe('_blank')
    expect(lien.textContent).toContain('Dramatoons')
  })

  it('déconnecté : seul le formulaire de connexion est affiché, avec ses libellés', async () => {
    await initialiser()

    expect(visibles()).toEqual(['deconnecte'])
    expect(document.querySelector('label[for="login"]').textContent).toBe('Login')
    expect(document.querySelector('label[for="motDePasse"]').textContent).toBe('Mot de passe')
    expect(document.querySelector('#formulaireConnexion button').textContent).toBe('Se connecter')
  })

  it('connecté : login, nombre de webtoons, interrupteur et déconnexion, dans cet ordre', async () => {
    reponses.utilisateur = { login: 'lecteur', total: 12 }

    await initialiser()

    expect(visibles()).toEqual(['connecte'])
    const textes = [...element('connecte').querySelectorAll('.stats-label, .stats-value, label, button')].map(
      (noeud) => noeud.textContent,
    )
    expect(textes).toEqual(['Utilisateur :', 'lecteur', 'Webtoons suivis :', '12', 'Extension activée :', 'Déconnexion'])
    expect(chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'utilisateur')).toHaveLength(1)
  })

  it('l’interrupteur montre l’état de l’onglet courant', async () => {
    reponses.utilisateur = { login: 'lecteur', total: 1 }
    reponses.etatOnglet = (message) => message.ongletId === 7

    await initialiser()

    expect(element('interrupteur').checked).toBe(true)
  })

  it('l’interrupteur change l’état de l’onglet courant seulement', async () => {
    reponses.utilisateur = { login: 'lecteur', total: 1 }
    await initialiser()

    element('interrupteur').checked = true
    element('interrupteur').dispatchEvent(new Event('change'))
    await attendre()

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'changerOnglet', ongletId: 7, actif: true })
  })

  it('le bouton « Rafraîchir » n’est pas encore affiché (ticket de l’activation)', async () => {
    reponses.utilisateur = { login: 'lecteur', total: 1 }
    await initialiser()

    expect(document.body.textContent).not.toContain('Rafraîchir')
  })

  it('l’API injoignable : « Erreur de connexion au serveur. »', async () => {
    reponses.utilisateur = new Error('Failed to fetch')

    await initialiser()

    expect(visibles()).toEqual(['erreurServeur'])
    expect(element('erreurServeur').textContent).toBe('Erreur de connexion au serveur.')
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: 'deconnexion' })
  })

  it('l’état de l’onglet illisible : « Erreur de connexion au serveur. » plutôt qu’une fenêtre vide', async () => {
    reponses.utilisateur = { login: 'lecteur', total: 1 }
    reponses.etatOnglet = new Error('pas de réponse')

    await initialiser()

    expect(visibles()).toEqual(['erreurServeur'])
    expect(element('erreurServeur').textContent).toBe('Erreur de connexion au serveur.')
  })

  it('un changement de l’interrupteur refusé le remet dans son état et affiche l’erreur', async () => {
    reponses.utilisateur = { login: 'lecteur', total: 1 }
    await initialiser()
    reponses.changerOnglet = new Error('pas de réponse')

    element('interrupteur').checked = true
    element('interrupteur').dispatchEvent(new Event('change'))
    await attendre()

    expect(element('interrupteur').checked).toBe(false)
    expect(visibles()).toEqual(['erreurServeur'])
  })

  it('sans onglet courant, l’interrupteur est désactivé et aucun état n’est demandé', async () => {
    chrome.tabs.query.mockResolvedValue([])
    reponses.utilisateur = { login: 'lecteur', total: 1 }

    await initialiser()

    expect(visibles()).toEqual(['connecte'])
    expect(element('interrupteur').checked).toBe(false)
    expect(element('interrupteur').disabled).toBe(true)
    expect(chrome.runtime.sendMessage.mock.calls.some(([message]) => message.type === 'etatOnglet')).toBe(false)
  })
})

describe('connexion depuis la fenêtre (règles « extension - connexion »)', () => {
  it('une connexion réussie affiche le compte et vide le mot de passe', async () => {
    await initialiser()
    reponses.connexion = { ok: true }
    reponses.utilisateur = { login: 'lecteur', total: 4 }

    await seConnecter('lecteur', 'secret')

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'connexion', login: 'lecteur', motDePasse: 'secret' })
    expect(visibles()).toEqual(['connecte'])
    expect(element('motDePasse').value).toBe('')
  })

  it('une connexion refusée affiche le message, et le formulaire reste', async () => {
    await initialiser()
    reponses.connexion = { ok: false, message: 'Votre compte a été désactivé.' }

    await seConnecter('desactive', 'secret')

    expect(visibles()).toEqual(['deconnecte'])
    expect(element('erreurConnexion').hidden).toBe(false)
    expect(element('erreurConnexion').textContent).toBe('Votre compte a été désactivé.')
  })

  it('sans réponse de l’arrière-plan : « Erreur de connexion au serveur. »', async () => {
    await initialiser()
    reponses.connexion = new Error('pas de réponse')

    await seConnecter('lecteur', 'secret')

    expect(element('erreurConnexion').textContent).toBe('Erreur de connexion au serveur.')
  })

  it('une déconnexion sans réponse de l’arrière-plan affiche l’erreur', async () => {
    reponses.utilisateur = { login: 'lecteur', total: 1 }
    await initialiser()
    reponses.deconnexion = new Error('pas de réponse')

    element('deconnexion').click()
    await attendre()

    expect(visibles()).toEqual(['erreurServeur'])
    expect(element('erreurServeur').textContent).toBe('Erreur de connexion au serveur.')
  })

  it('la déconnexion revient au formulaire', async () => {
    reponses.utilisateur = { login: 'lecteur', total: 1 }
    await initialiser()
    reponses.utilisateur = null

    element('deconnexion').click()
    await attendre()

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'deconnexion' })
    expect(visibles()).toEqual(['deconnecte'])
  })
})
