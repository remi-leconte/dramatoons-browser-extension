// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('un document sans <body> (fichier SVG ou XML) n’est simplement pas surligné', () => {
    const corps = document.body
    corps.remove()
    try {
      expect(() => surligner([webtoon('Solo')])).not.toThrow()
    } finally {
      document.documentElement.append(corps)
    }
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

  it('activation 5 : le retrait remet les nœuds de texte d’origine eux-mêmes, sans fusionner leurs voisins', () => {
    const paragraphe = document.createElement('p')
    const titre = document.createTextNode('The Boxer')
    const voisin = document.createTextNode(' suite')
    paragraphe.append(titre, voisin)
    document.body.append(paragraphe)

    surligner([webtoon('The Boxer', { note: 4 })])
    expect(titre.isConnected).toBe(false)

    recevoir({ type: 'retirer' })

    expect([...paragraphe.childNodes]).toEqual([titre, voisin])
    expect(titre.nodeValue).toBe('The Boxer')
  })

  it('activation 5 : un texte surligné que la page a retiré entre-temps n’est pas remis', () => {
    document.body.innerHTML = '<p id="a">The Boxer</p>'
    surligner([webtoon('The Boxer')])
    document.getElementById('a').remove()

    recevoir({ type: 'retirer' })

    expect(document.body.innerHTML).toBe('')
  })

  it('activation 5 : si la page a retiré une partie des morceaux, le texte d’origine reprend leur place', () => {
    document.body.innerHTML = '<p>Lu : The Boxer hier</p>'
    surligner([webtoon('The Boxer')])
    document.querySelector('p').firstChild.remove()

    recevoir({ type: 'retirer' })

    expect(document.querySelector('p').textContent).toBe('Lu : The Boxer hier')
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

describe('contenu ajouté après le chargement (règle « surlignage » 10)', () => {
  const delai = () => globalThis.DramatoonsSurlignage.DELAI_MS
  // Laisse passer les rappels du MutationObserver, puis le délai de regroupement
  async function apresRegroupement() {
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(delai())
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    recevoir({ type: 'retirer' })
    vi.useRealTimers()
  })

  it('un élément ajouté après le surlignage est surligné, après le délai de regroupement', async () => {
    document.body.innerHTML = '<ul id="liste"><li>Rien</li></ul>'
    surligner([webtoon('The Boxer', { note: 4 })])
    const element = document.createElement('li')
    element.textContent = 'The Boxer'
    document.getElementById('liste').append(element)

    await Promise.resolve()
    expect(titres()).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(delai())

    expect(titres().map((titre) => titre.textContent)).toEqual(['The Boxer'])
    expect(pastilles().map((pastille) => pastille.textContent)).toEqual(['⭐ 4'])
  })

  it('un texte modifié sur place (élément recyclé) est surligné', async () => {
    document.body.innerHTML = '<p id="carte">Rien</p>'
    surligner([webtoon('The Boxer')])

    document.getElementById('carte').firstChild.nodeValue = 'The Boxer'
    await apresRegroupement()

    expect(titres().map((titre) => titre.textContent)).toEqual(['The Boxer'])
  })

  it('un titre déjà surligné que le site recycle est remplacé par son nouveau texte, surligné s’il le faut', async () => {
    document.body.innerHTML = '<p id="carte">The Boxer</p><p id="autre">The Boxer</p>'
    const carte = document.getElementById('carte')
    const autre = document.getElementById('autre')
    // Les références que garde un framework : les nœuds de texte d'origine, sortis de la page par le surlignage
    const texteCarte = carte.firstChild
    const texteAutre = autre.firstChild
    surligner([webtoon('The Boxer', { note: 4 }), webtoon('Solo', { note: 2 })])
    expect(titres()).toHaveLength(2)

    texteCarte.nodeValue = 'Solo'
    texteAutre.nodeValue = 'Rien à voir'
    await apresRegroupement()

    expect(carte.textContent).toBe('Solo⭐ 2')
    expect(carte.querySelector('.dramatoons-titre').textContent).toBe('Solo')
    expect(autre.textContent).toBe('Rien à voir')
    expect(autre.firstChild).toBe(texteAutre)

    recevoir({ type: 'retirer' })
    expect(carte.firstChild).toBe(texteCarte)
    expect(carte.childNodes).toHaveLength(1)
  })

  it('un <body> remplacé en entier (page suivante sans rechargement) est surligné et surveillé', async () => {
    document.body.innerHTML = '<p>Rien</p>'
    surligner([webtoon('The Boxer'), webtoon('Solo')])

    const nouveau = document.createElement('body')
    nouveau.innerHTML = '<ul id="liste"><li>The Boxer</li></ul>'
    document.documentElement.replaceChild(nouveau, document.body)
    await apresRegroupement()
    expect(titres().map((titre) => titre.textContent)).toEqual(['The Boxer'])

    const element = document.createElement('li')
    element.textContent = 'Solo'
    document.getElementById('liste').append(element)
    await apresRegroupement()
    expect(titres().map((titre) => titre.textContent)).toEqual(['The Boxer', 'Solo'])
  })

  it('un texte ajouté hors du <body> (titre de l’onglet) n’est pas surligné', async () => {
    surligner([webtoon('The Boxer')])

    document.title = 'The Boxer'
    await apresRegroupement()

    expect(document.title).toBe('The Boxer')
    expect(document.querySelector('title').children).toHaveLength(0)
  })

  it('une page qui change sans arrêt ne repousse pas le traitement au-delà du délai maximal', async () => {
    document.body.innerHTML = '<span id="compteur">0</span><ul id="liste"></ul>'
    surligner([webtoon('The Boxer')])
    const compteur = document.getElementById('compteur').firstChild
    const element = document.createElement('li')
    element.textContent = 'The Boxer'
    document.getElementById('liste').append(element)

    // Le compteur change plus souvent que le délai de regroupement : sans plafond, rien ne serait jamais traité
    const pas = delai() / 3
    for (let temps = 0; temps < globalThis.DramatoonsSurlignage.DELAI_MAX_MS; temps += pas) {
      compteur.nodeValue = String(temps)
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(pas)
    }

    expect(titres().map((titre) => titre.textContent)).toEqual(['The Boxer'])
  })

  it('un surlignage jeté par le site n’est plus suivi, mais il l’est encore si seul son élément est sorti', async () => {
    document.body.innerHTML = '<p id="jete">The Boxer</p><div id="zone"><p id="sorti">The Boxer</p></div>'
    const jete = document.getElementById('jete')
    const sorti = document.getElementById('sorti')
    const texteJete = jete.firstChild
    const texteSorti = sorti.firstChild
    surligner([webtoon('The Boxer')])

    // Recyclage façon React : le contenu de l'élément est remplacé, ses enfants (les morceaux) sont jetés
    jete.textContent = 'Autre chose'
    sorti.remove()
    await apresRegroupement()

    texteJete.nodeValue = 'Rien'
    await Promise.resolve()
    expect(vi.getTimerCount()).toBe(0)

    document.getElementById('zone').append(sorti)
    texteSorti.nodeValue = 'Rien à voir'
    await apresRegroupement()
    expect(sorti.firstChild).toBe(texteSorti)
    expect(sorti.textContent).toBe('Rien à voir')
  })

  it('un élément sorti de la page retrouve son texte quand le site le remet, après un retrait ou un recyclage', async () => {
    document.body.innerHTML = '<div id="zone"><p id="retire">The Boxer</p><p id="recycle">The Boxer</p></div>'
    const zone = document.getElementById('zone')
    const retire = document.getElementById('retire')
    const recycle = document.getElementById('recycle')
    const texteRetire = retire.firstChild
    const texteRecycle = recycle.firstChild
    surligner([webtoon('The Boxer')])

    // Recyclage hors de la page, traité avant que l'élément revienne
    recycle.remove()
    texteRecycle.nodeValue = 'Rien à voir'
    await apresRegroupement()
    zone.append(recycle)
    expect(recycle.textContent).toBe('Rien à voir')

    // Retrait du surlignage (désactivation) pendant que l'élément est hors de la page
    retire.remove()
    recevoir({ type: 'retirer' })
    zone.append(retire)
    expect(retire.firstChild).toBe(texteRetire)
    expect(retire.textContent).toBe('The Boxer')
  })

  it('plusieurs ajouts rapprochés ne donnent qu’un seul traitement, et chaque titre une seule fois', async () => {
    document.body.innerHTML = '<ul id="liste"></ul>'
    surligner([webtoon('The Boxer'), webtoon('Solo')])
    const liste = document.getElementById('liste')

    for (const titre of ['The Boxer', 'Solo']) {
      const element = document.createElement('li')
      element.textContent = titre
      liste.append(element)
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(delai() / 2)
    }
    // Le second ajout a repoussé le traitement : sans ce regroupement, « The Boxer » serait déjà surligné
    expect(titres()).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(delai())

    expect(titres().map((titre) => titre.textContent)).toEqual(['The Boxer', 'Solo'])
  })

  it('les titres et pastilles posés par l’extension ne relancent aucun traitement', async () => {
    document.body.innerHTML = '<ul id="liste"></ul>'
    surligner([webtoon('The Boxer', { note: 4 })])
    const element = document.createElement('li')
    element.textContent = 'The Boxer'
    document.getElementById('liste').append(element)
    await apresRegroupement()
    expect(titres()).toHaveLength(1)

    await Promise.resolve()

    expect(vi.getTimerCount()).toBe(0)
    expect(titres()).toHaveLength(1)
  })

  it('un ajout dans un champ de saisie ou une zone éditable n’est pas surligné', async () => {
    document.body.innerHTML = '<div contenteditable="true" id="zone"></div><form id="formulaire"></form>'
    surligner([webtoon('The Boxer')])

    document.getElementById('zone').textContent = 'The Boxer'
    document.getElementById('formulaire').innerHTML =
      '<textarea>The Boxer</textarea><select><option>The Boxer</option></select>'
    await apresRegroupement()

    expect(titres()).toHaveLength(0)
  })

  it('seuls les textes ajoutés sont relus, pas le reste de la page', async () => {
    document.body.innerHTML = '<p>Ancien texte</p><ul id="liste"></ul>'
    surligner([webtoon('The Boxer')])
    const chercher = vi.spyOn(globalThis.DramatoonsCorrespondance, 'chercher')

    const element = document.createElement('li')
    element.textContent = 'The Boxer'
    document.getElementById('liste').append(element)
    await apresRegroupement()

    expect(chercher.mock.calls.map(([texte]) => texte)).toEqual(['The Boxer'])
    chercher.mockRestore()
  })

  it('après le retrait, plus rien n’est surveillé (désactivation, déconnexion)', async () => {
    document.body.innerHTML = '<ul id="liste"></ul>'
    surligner([webtoon('The Boxer')])
    recevoir({ type: 'retirer' })

    const element = document.createElement('li')
    element.textContent = 'The Boxer'
    document.getElementById('liste').append(element)
    await apresRegroupement()

    expect(titres()).toHaveLength(0)
  })

  it('un ajout en attente au moment du retrait n’est pas surligné ensuite', async () => {
    document.body.innerHTML = '<ul id="liste"></ul>'
    surligner([webtoon('The Boxer')])
    const element = document.createElement('li')
    element.textContent = 'The Boxer'
    document.getElementById('liste').append(element)
    await Promise.resolve()

    recevoir({ type: 'retirer' })
    await vi.advanceTimersByTimeAsync(delai())

    expect(titres()).toHaveLength(0)
  })
})

