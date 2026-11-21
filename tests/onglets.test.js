import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activerOnglet, listeOnglet, ongletActif, ongletsActifs, oublierOnglet } from '../src/lib/onglets.mjs'
import { simulerChrome } from './chrome-simule.js'

let chrome

beforeEach(() => {
  chrome = simulerChrome()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const liste = [{ titrePrincipal: 'Solo', titres: ['Solo'], etat: null, note: null, chapitre: null }]

describe('état des onglets (règles « extension - activation » 1 et « liste des webtoons » 2)', () => {
  it('un nouvel onglet est désactivé, sans liste', async () => {
    expect(await ongletActif(1)).toBe(false)
    expect(await listeOnglet(1)).toBeNull()
  })

  it('l’activation garde la liste de l’onglet, et ne concerne que lui', async () => {
    await activerOnglet(1, liste)

    expect(await ongletActif(1)).toBe(true)
    expect(await listeOnglet(1)).toEqual(liste)
    expect(await ongletActif(2)).toBe(false)
    expect(await ongletsActifs()).toEqual([1])
  })

  it('oublier un onglet le désactive et efface sa liste', async () => {
    await activerOnglet(1, liste)
    await activerOnglet(2, liste)

    await oublierOnglet(1)

    expect(await ongletActif(1)).toBe(false)
    expect(await listeOnglet(1)).toBeNull()
    expect(await ongletsActifs()).toEqual([2])
  })

  it('l’état est rangé dans storage.session, qui survit à la mise en veille de l’arrière-plan', async () => {
    await activerOnglet(1, liste)

    expect(Object.keys(chrome.storage.session.donnees)).toEqual(['onglet-1', 'liste-1'])
    expect(chrome.storage.local.set).not.toHaveBeenCalled()
  })
})
