import { vi } from 'vitest'

// Stockage en mémoire, avec les mêmes formes d'appel que chrome.storage (clé, liste de clés ou rien)
function stockage() {
  const donnees = {}
  const cles = (demande) => (demande == null ? Object.keys(donnees) : [demande].flat())
  return {
    donnees,
    get: vi.fn(async (demande) =>
      Object.fromEntries(cles(demande).filter((cle) => cle in donnees).map((cle) => [cle, donnees[cle]])),
    ),
    set: vi.fn(async (valeurs) => {
      Object.assign(donnees, valeurs)
    }),
    remove: vi.fn(async (demande) => {
      for (const cle of cles(demande)) delete donnees[cle]
    }),
  }
}

/** Installe un faux `chrome` global et le renvoie. */
export function simulerChrome({ ongletActif = { id: 7 } } = {}) {
  const chrome = {
    storage: { local: stockage(), session: stockage() },
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn(),
    },
    tabs: {
      query: vi.fn(async () => (ongletActif ? [ongletActif] : [])),
      sendMessage: vi.fn(async () => undefined),
      onRemoved: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
    },
    scripting: { executeScript: vi.fn(async () => []) },
    permissions: { contains: vi.fn(async () => true), request: vi.fn(async () => true) },
  }
  vi.stubGlobal('chrome', chrome)
  return chrome
}

/** Réponse HTTP JSON pour un faux fetch. */
export function reponse(status, corps) {
  return new Response(corps === undefined ? null : JSON.stringify(corps), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
