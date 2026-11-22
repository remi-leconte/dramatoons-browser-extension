import { describe, expect, it } from 'vitest'
import {
  API_PRODUCTION,
  configProduction,
  contientAdresseDev,
  fichiersAvecAdresseDev,
  manifesteProduction,
} from '../scripts/production.mjs'

describe('construction du zip de production', () => {
  it('config.mjs : l’adresse de l’API devient celle de la production, le reste ne change pas', () => {
    const texte = "// commentaire\nexport const API_URL = 'http://127.0.0.1:8081'\n"

    expect(configProduction(texte)).toBe(`// commentaire\nexport const API_URL = '${API_PRODUCTION}'\n`)
  })

  it('config.mjs : sans ligne API_URL reconnue, ou avec plusieurs, la construction est refusée', () => {
    expect(() => configProduction('export const API_URL = `http://127.0.0.1:8081`\n')).toThrow(/0 ligne/)
    expect(() =>
      configProduction("export const API_URL = 'http://a'\nexport const API_URL = 'http://b'\n"),
    ).toThrow(/2 ligne/)
  })

  it('manifeste : l’accès à l’API du dev est retiré, le reste est gardé', () => {
    const manifeste = {
      version: '2.5.0',
      permissions: ['storage'],
      host_permissions: ['<all_urls>', `${API_PRODUCTION}/*`, 'http://127.0.0.1:8081/*', 'http://localhost:8081/*'],
    }

    expect(manifesteProduction(manifeste)).toEqual({
      version: '2.5.0',
      permissions: ['storage'],
      host_permissions: ['<all_urls>', `${API_PRODUCTION}/*`],
    })
    expect(manifeste.host_permissions).toHaveLength(4)
  })

  it('manifeste : sans accès à l’API de production, la construction est refusée', () => {
    expect(() => manifesteProduction({ host_permissions: ['<all_urls>', 'http://127.0.0.1:8081/*'] })).toThrow(
      API_PRODUCTION,
    )
    expect(() => manifesteProduction({})).toThrow(API_PRODUCTION)
  })

  it('une adresse du dev est repérée dans un texte', () => {
    expect(contientAdresseDev("fetch('http://127.0.0.1:8081/me')")).toBe(true)
    expect(contientAdresseDev('http://localhost:5173')).toBe(true)
    expect(contientAdresseDev(`fetch('${API_PRODUCTION}/me')`)).toBe(false)
  })

  it('tout fichier texte de la copie qui garde une adresse du dev est signalé ; les images sont sautées', () => {
    const fichiers = [
      { chemin: 'dist/src/lib/x.mjs', contenu: "const api = 'http://127.0.0.1:8081'" },
      { chemin: 'dist/src/popup.html', contenu: '<a href="http://localhost:5173">' },
      { chemin: 'dist/src/manifest.json', contenu: '{ "host_permissions": ["http://127.0.0.1:8081/*"] }' },
      { chemin: 'dist/src/LISEZMOI', contenu: 'API sur localhost' },
      { chemin: 'dist/src/icons/icone.png', contenu: '127.0.0.1' },
      { chemin: 'dist/src/background.mjs', contenu: `fetch('${API_PRODUCTION}/me')` },
    ]

    expect(fichiersAvecAdresseDev(fichiers)).toEqual([
      'dist/src/lib/x.mjs',
      'dist/src/popup.html',
      'dist/src/manifest.json',
      'dist/src/LISEZMOI',
    ])
  })

  it('une copie sans adresse du dev ne signale rien', () => {
    expect(fichiersAvecAdresseDev([{ chemin: 'dist/src/config.mjs', contenu: `'${API_PRODUCTION}'` }])).toEqual([])
  })
})
