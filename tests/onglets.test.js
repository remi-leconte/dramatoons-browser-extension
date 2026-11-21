import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changerOnglet, ongletActif } from '../src/lib/onglets.mjs'
import { simulerChrome } from './chrome-simule.js'

let chrome

beforeEach(() => {
  chrome = simulerChrome()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('état des onglets (règle « extension - activation » 1)', () => {
  it('un nouvel onglet est désactivé', async () => {
    expect(await ongletActif(1)).toBe(false)
  })

  it('l’activation et la désactivation ne concernent que leur onglet', async () => {
    await changerOnglet(1, true)

    expect(await ongletActif(1)).toBe(true)
    expect(await ongletActif(2)).toBe(false)

    await changerOnglet(1, false)

    expect(await ongletActif(1)).toBe(false)
  })

  it('l’état est rangé dans storage.session, qui survit à la mise en veille de l’arrière-plan', async () => {
    await changerOnglet(1, true)

    expect(chrome.storage.session.donnees).toEqual({ 'onglet-1': true })
    expect(chrome.storage.local.set).not.toHaveBeenCalled()
  })
})
