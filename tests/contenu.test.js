// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { simulerChrome } from './chrome-simule.js'

let chrome
let recevoir

beforeAll(async () => {
  chrome = simulerChrome()
  await import('../src/lib/correspondance.js')
  await import('../src/contenu.js')
  recevoir = chrome.runtime.onMessage.addListener.mock.calls[0][0]
})

beforeEach(() => {
  document.body.innerHTML = ''
})

const webtoon = (titrePrincipal, suivi = {}) => ({
  titrePrincipal,
  titres: [titrePrincipal],
  etat: null,
  note: null,
  chapitre: null,
  ...suivi,
})

const surligner = (liste) => recevoir({ type: 'surligner', liste })
const titres = () => [...document.querySelectorAll('.dramatoons-titre')]
const pastilles = () => [...document.querySelectorAll('.dramatoons-pastille')]
const style = (element, propriete) => element.style.getPropertyValue(propriete)

describe('surlignage dans la page (règles « extension - surlignage »)', () => {
  it('règle 7 : couleur de l’état (couleurs du site), texte blanc, curseur point d’interrogation', () => {
    document.body.innerHTML = '<p>A</p><p>B</p><p>C</p><p>D</p><p>E</p>'
    surligner([
      webtoon('A', { etat: 'reading' }),
      webtoon('B', { etat: 'pause' }),
      webtoon('C', { etat: 'break' }),
      webtoon('D', { etat: 'completed' }),
      webtoon('E'),
    ])

    expect(titres().map((titre) => [titre.textContent, style(titre, 'background')])).toEqual([
      ['A', 'rgba(33, 150, 243, 0.9)'],
      ['B', 'rgba(255, 152, 0, 0.9)'],
      ['C', 'rgba(229, 9, 20, 0.9)'],
      ['D', 'rgba(76, 175, 80, 0.9)'],
      ['E', 'rgba(85, 85, 85, 0.9)'],
    ])
    for (const titre of titres()) {
      expect(style(titre, 'color')).toBe('#fff')
      expect(style(titre, 'cursor')).toBe('help')
      expect(titre.style.getPropertyPriority('background')).toBe('important')
    }
  })

  it('règles 8 et 9 : pastille « ⭐ note 📌 chapitre » après le titre, et même texte en infobulle', () => {
    document.body.innerHTML = '<p>Lu : The Boxer hier</p>'
    surligner([webtoon('The Boxer', { etat: 'reading', note: 4.5, chapitre: 120 })])

    const [titre] = titres()
    expect(titre.textContent).toBe('The Boxer')
    expect(titre.title).toBe('⭐ 4.5 📌 120')
    expect(titre.nextSibling).toBe(pastilles()[0])
    expect(pastilles()[0].textContent).toBe('⭐ 4.5 📌 120')
    expect(document.body.textContent).toBe('Lu : The Boxer⭐ 4.5 📌 120 hier')
  })

  it('règles 8 et 9 : une valeur absente n’est pas affichée ; sans note ni chapitre, ni pastille ni infobulle', () => {
    document.body.innerHTML = '<p>Note</p><p>Chapitre</p><p>Rien</p>'
    surligner([webtoon('Note', { note: 8 }), webtoon('Chapitre', { chapitre: 42 }), webtoon('Rien')])

    expect(pastilles().map((pastille) => pastille.textContent)).toEqual(['⭐ 8', '📌 42'])
    expect(titres().map((titre) => titre.title)).toEqual(['⭐ 8', '📌 42', ''])
  })

  it('règle 1 : seul le texte visible est lu, pas les scripts ni les styles', () => {
    document.body.innerHTML = '<script>var a = "Solo"</script><style>.Solo{}</style><p>Solo</p>'
    surligner([webtoon('Solo')])

    expect(titres()).toHaveLength(1)
    expect(document.querySelector('script').textContent).toBe('var a = "Solo"')
  })

  it('règle 11 : un titre dans un lien est surligné, et le lien reste le même', () => {
    document.body.innerHTML = '<a href="/serie/solo">Solo</a>'
    surligner([webtoon('Solo')])

    const lien = document.querySelector('a')
    expect(lien.getAttribute('href')).toBe('/serie/solo')
    expect(lien.querySelector('.dramatoons-titre').textContent).toBe('Solo')
  })

  it('règle 11 : les champs de saisie et les zones éditables ne sont pas touchés', () => {
    document.body.innerHTML = '<textarea>Solo</textarea><div contenteditable="true">Solo</div><input value="Solo">'
    surligner([webtoon('Solo')])

    expect(titres()).toHaveLength(0)
    expect(document.querySelector('textarea').value).toBe('Solo')
  })

  it('règle 11 : le texte d’un dessin SVG n’est pas touché', () => {
    document.body.innerHTML = '<svg><text>Solo</text><title>Solo</title></svg><p>Solo</p>'
    surligner([webtoon('Solo')])

    expect(titres()).toHaveLength(1)
    expect(document.querySelector('svg text').textContent).toBe('Solo')
    expect(document.querySelector('svg text').children).toHaveLength(0)
  })

  it('activation 5 : retirer le surlignage rend la page telle qu’elle était', () => {
    document.body.innerHTML = '<p>Lu : <b>The Boxer</b> et Solo hier</p>'
    const avant = document.body.innerHTML
    surligner([webtoon('The Boxer', { note: 4 }), webtoon('Solo', { chapitre: 3 })])
    expect(titres()).toHaveLength(2)

    recevoir({ type: 'retirer' })

    expect(titres()).toHaveLength(0)
    expect(pastilles()).toHaveLength(0)
    expect(document.body.innerHTML).toBe(avant)
  })

  it('liste 3 : surligner de nouveau (rafraîchir) ne double rien et suit la nouvelle liste', () => {
    document.body.innerHTML = '<p>The Boxer</p>'
    surligner([webtoon('The Boxer', { note: 4 })])
    surligner([webtoon('The Boxer', { note: 5 })])

    expect(titres()).toHaveLength(1)
    expect(pastilles().map((pastille) => pastille.textContent)).toEqual(['⭐ 5'])
  })

  it('une seconde injection dans la même page n’ajoute pas d’écouteur', async () => {
    const avant = chrome.runtime.onMessage.addListener.mock.calls.length
    vi.resetModules()
    await import('../src/contenu.js')

    expect(chrome.runtime.onMessage.addListener.mock.calls.length).toBe(avant)
    expect(globalThis.DramatoonsSurlignage).toBeDefined()
  })
})
