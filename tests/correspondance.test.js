import { beforeAll, describe, expect, it } from 'vitest'

let correspondance

beforeAll(async () => {
  await import('../src/lib/correspondance.js')
  correspondance = globalThis.DramatoonsCorrespondance
})

const webtoon = (titrePrincipal, ...secondaires) => ({ titrePrincipal, titres: [titrePrincipal, ...secondaires] })

/** Les extraits trouvés dans le texte, avec le titre principal du webtoon reconnu. */
function trouves(texte, webtoons) {
  return correspondance
    .chercher(texte, correspondance.preparer(webtoons))
    .map(({ debut, fin, webtoon }) => [texte.slice(debut, fin), webtoon.titrePrincipal])
}

describe('correspondance des titres (règles « extension - surlignage »)', () => {
  it('règle 2 : ni la casse, ni les accents, ni la ponctuation ne comptent', () => {
    const ragnarok = webtoon('Solo Leveling : Ragnarök')

    expect(trouves('Lire solo leveling ragnarok ici', [ragnarok])).toEqual([['solo leveling ragnarok', 'Solo Leveling : Ragnarök']])
    expect(trouves('SOLO-LEVELING: RAGNAROK!', [ragnarok])).toEqual([['SOLO-LEVELING: RAGNAROK', 'Solo Leveling : Ragnarök']])
  })

  it('règle 2 : le titre est surligné tel qu’il est écrit sur la page', () => {
    expect(trouves('Voir « Héros  du  Ciel » demain', [webtoon('heros du ciel')])).toEqual([['Héros  du  Ciel', 'heros du ciel']])
  })

  it('règle 3 : seuls des mots entiers sont surlignés', () => {
    expect(trouves('Solomon et Solos', [webtoon('Solo')])).toEqual([])
    expect(trouves('Le Solo, enfin', [webtoon('Solo')])).toEqual([['Solo', 'Solo']])
  })

  it('règle 3 : un titre fait d’un mot courant est surligné partout où il apparaît', () => {
    expect(trouves('Love me, love you', [webtoon('Love')])).toEqual([
      ['Love', 'Love'],
      ['love', 'Love'],
    ])
  })

  it('règle 4 : un début de titre sans points de suspension n’est pas surligné', () => {
    expect(trouves('Solo Leveling: Ragna', [webtoon('Solo Leveling : Ragnarok')])).toEqual([])
  })

  it('règle 5 : un titre tronqué par « … » ou « ... » est surligné, même coupé au milieu d’un mot', () => {
    const ragnarok = webtoon('Solo Leveling : Ragnarok')

    expect(trouves('Solo Leveling: Rag…', [ragnarok])).toEqual([['Solo Leveling: Rag', 'Solo Leveling : Ragnarok']])
    expect(trouves('Solo Leveling: Rag...', [ragnarok])).toEqual([['Solo Leveling: Rag', 'Solo Leveling : Ragnarok']])
  })

  it('règle 5 : un titre tronqué l’emporte sur un titre plus court qu’il contient', () => {
    expect(trouves('Solo Leveling: Rag…', [webtoon('Solo Leveling'), webtoon('Solo Leveling : Ragnarok')])).toEqual([
      ['Solo Leveling: Rag', 'Solo Leveling : Ragnarok'],
    ])
  })

  it('règle 5 : il faut au moins 10 lettres ou chiffres avant les points de suspension, espaces non comptés', () => {
    expect(trouves('Solo Level…', [webtoon('Solo Leveling')])).toEqual([])
    expect(trouves('Solo Leveli…', [webtoon('Solo Leveling')])).toEqual([['Solo Leveli', 'Solo Leveling']])
  })

  it('règle 5 : un titre tronqué en fin de phrase, après un titre complet', () => {
    expect(trouves('Lu : The Boxer, puis The Breaker: New Wav…', [webtoon('The Boxer'), webtoon('The Breaker: New Waves')])).toEqual([
      ['The Boxer', 'The Boxer'],
      ['The Breaker: New Wav', 'The Breaker: New Waves'],
    ])
  })

  it('règle 5 : un titre tronqué au milieu d’une phrase, suivi d’autres titres', () => {
    expect(trouves('Lire The Breaker: New Wav… et The Boxer', [webtoon('The Breaker: New Waves'), webtoon('The Boxer')])).toEqual([
      ['The Breaker: New Wav', 'The Breaker: New Waves'],
      ['The Boxer', 'The Boxer'],
    ])
  })

  it('règle 5 : un texte tronqué égal à un titre complet désigne le titre plus long qui le prolonge', () => {
    expect(trouves('Solo Leveling…', [webtoon('Solo Leveling'), webtoon('Solo Leveling : Ragnarok')])).toEqual([
      ['Solo Leveling', 'Solo Leveling : Ragnarok'],
    ])
  })

  it('règle 5 : sans titre plus long, le texte tronqué égal à un titre complet désigne ce titre', () => {
    expect(trouves('Solo Leveling…', [webtoon('Solo Leveling')])).toEqual([['Solo Leveling', 'Solo Leveling']])
  })

  it('un titre qui contient lui-même « ... » est reconnu en entier', () => {
    expect(trouves('Wait... Is This Love?', [webtoon('Wait... Is This Love')])).toEqual([['Wait... Is This Love', 'Wait... Is This Love']])
  })

  it('règle 5 : un début commun à plusieurs webtoons prend le premier par ordre alphabétique', () => {
    expect(trouves('Tower of Dra…', [webtoon('Tower of Dreams'), webtoon('Tower of Dragons')])).toEqual([
      ['Tower of Dra', 'Tower of Dragons'],
    ])
  })

  it('règle 6 : à un même endroit, le titre le plus long l’emporte, chacun avec ses informations', () => {
    const solo = webtoon('Solo Leveling')
    const ragnarok = webtoon('Solo Leveling : Ragnarok')

    expect(trouves('Solo Leveling : Ragnarok, suite de Solo Leveling', [solo, ragnarok])).toEqual([
      ['Solo Leveling : Ragnarok', 'Solo Leveling : Ragnarok'],
      ['Solo Leveling', 'Solo Leveling'],
    ])
  })

  it('règle 6 : deux titres qui se chevauchent sans commencer au même endroit : le plus long l’emporte', () => {
    expect(trouves('The Boxer King Returns', [webtoon('The Boxer'), webtoon('Boxer King Returns')])).toEqual([
      ['Boxer King Returns', 'Boxer King Returns'],
    ])
    expect(trouves('The Boxer est là', [webtoon('The Boxer'), webtoon('Boxer King Returns')])).toEqual([['The Boxer', 'The Boxer']])
  })

  it('règle 6 : un titre écarté par un autre lui-même écarté reste surligné', () => {
    const webtoons = [webtoon('Al Beta'), webtoon('Beta Gamma'), webtoon('Gamma Delta Epsilon')]

    expect(trouves('Al Beta Gamma Delta Epsil…', webtoons)).toEqual([
      ['Al Beta', 'Al Beta'],
      ['Gamma Delta Epsil', 'Gamma Delta Epsilon'],
    ])
  })

  it('règle 1 : les titres secondaires sont cherchés comme le titre principal', () => {
    expect(trouves('Na Honjaman Level Up', [webtoon('Solo Leveling', 'Na Honjaman Level Up')])).toEqual([
      ['Na Honjaman Level Up', 'Solo Leveling'],
    ])
  })

  it('un titre qui contient « ... » après 10 lettres l’emporte sur le titre tronqué qu’il contient (règle 6)', () => {
    expect(trouves('Tower of Dreams... Again', [webtoon('Tower of Dreams... Again')])).toEqual([
      ['Tower of Dreams... Again', 'Tower of Dreams... Again'],
    ])
  })

  it('un très long texte d’un seul bloc (roman, fichier texte) est parcouru en un temps linéaire', () => {
    const webtoons = Array.from({ length: 300 }, (_, i) => webtoon(`Webtoon numéro ${i} du test`))
    const texte = `${'mot '.repeat(50_000)}Webtoon numéro 12 du test, puis Webtoon numéro 7…`

    const debut = performance.now()
    const resultat = trouves(texte, webtoons)
    const duree = performance.now() - debut

    expect(resultat).toEqual([
      ['Webtoon numéro 12 du test', 'Webtoon numéro 12 du test'],
      ['Webtoon numéro 7', 'Webtoon numéro 7 du test'],
    ])
    expect(duree).toBeLessThan(1000)
  })

  it('un texte sans titre de la bibliothèque ne donne rien', () => {
    expect(trouves('Rien à voir ici…', [webtoon('Solo Leveling')])).toEqual([])
    expect(trouves('', [webtoon('Solo Leveling')])).toEqual([])
  })
})
