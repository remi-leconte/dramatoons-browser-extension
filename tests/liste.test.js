import { describe, expect, it } from 'vitest'
import { versListe } from '../src/lib/liste.mjs'

describe('liste des webtoons reçue de GET /webtoons?mode=ext', () => {
  it('garde les titres (principal et secondaires, sans doublon), l’état, la note et le chapitre', () => {
    const webtoons = [
      {
        title: { id: 1, title: 'Solo Leveling' },
        secondaryTitles: { 1: { id: 1, title: 'Solo Leveling' }, 2: { id: 2, title: 'Na Honjaman Level Up' } },
        userProgress: { state: 'reading', rate: 4.5, bookmark: 120 },
      },
    ]

    expect(versListe(webtoons)).toEqual([
      { titrePrincipal: 'Solo Leveling', titres: ['Solo Leveling', 'Na Honjaman Level Up'], etat: 'reading', note: 4.5, chapitre: 120 },
    ])
  })

  it('un webtoon sans suivi (créé, non suivi) ou à suivi incomplet n’a que ce qui est rempli', () => {
    const webtoons = [
      { title: { title: 'Créé' }, secondaryTitles: [] },
      { title: { title: 'Note seule' }, userProgress: { rate: 3 } },
      { title: { title: 'Chapitre 0' }, userProgress: { state: 'pause', bookmark: 0 } },
    ]

    expect(versListe(webtoons)).toEqual([
      { titrePrincipal: 'Créé', titres: ['Créé'], etat: null, note: null, chapitre: null },
      { titrePrincipal: 'Note seule', titres: ['Note seule'], etat: null, note: 3, chapitre: null },
      { titrePrincipal: 'Chapitre 0', titres: ['Chapitre 0'], etat: 'pause', note: null, chapitre: null },
    ])
  })
})
