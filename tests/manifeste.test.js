import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifeste = JSON.parse(readFileSync('src/manifest.json', 'utf8'))

describe('manifeste (règles « extension - activation »)', () => {
  it('peut injecter le surlignage dans n’importe quelle page', () => {
    expect(manifeste.permissions).toContain('scripting')
    expect(manifeste.host_permissions).toContain('<all_urls>')
  })

  it('règle 2 : aucun script n’est injecté d’office dans les pages, seulement dans un onglet activé', () => {
    expect(manifeste.content_scripts).toBeUndefined()
    expect(manifeste.web_accessible_resources).toBeUndefined()
  })
})
