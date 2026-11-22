// Transformations de src/ vers le zip publié, séparées de construire.mjs pour être testées sans rien écrire sur le disque
export const API_PRODUCTION = 'https://api.dramatoons.ovh'

// Adresses qui ne doivent jamais partir sur un store
const ADRESSES_DEV = ['127.0.0.1', 'localhost']

const LIGNE_API = /^export const API_URL = '[^']*'$/m

export function configProduction(texte) {
  const lignes = texte.match(new RegExp(LIGNE_API.source, 'gm')) ?? []
  if (lignes.length !== 1) throw new Error(`config.mjs : ${lignes.length} ligne(s) « export const API_URL = '…' » au lieu d'une`)
  return texte.replace(LIGNE_API, `export const API_URL = '${API_PRODUCTION}'`)
}

export function manifesteProduction(manifeste) {
  const acces = manifeste.host_permissions ?? []
  if (!acces.includes(`${API_PRODUCTION}/*`)) throw new Error(`manifest.json : l'accès à ${API_PRODUCTION}/* manque`)
  return { ...manifeste, host_permissions: acces.filter((adresse) => !contientAdresseDev(adresse)) }
}

export function contientAdresseDev(texte) {
  return ADRESSES_DEV.some((adresse) => texte.includes(adresse))
}

// Seules les PNG, format de toutes les icônes, sont sautées : tout autre fichier de la copie, avec ou sans extension,
// est lu comme du texte (une icône d'un autre format serait à ajouter ici)
const BINAIRES = new Set(['.png'])

/** @param {{ chemin: string, contenu: string }[]} fichiers @returns {string[]} les chemins des fichiers fautifs */
export function fichiersAvecAdresseDev(fichiers) {
  return fichiers
    .filter(({ chemin }) => !BINAIRES.has(chemin.slice(chemin.lastIndexOf('.')).toLowerCase()))
    .filter(({ contenu }) => contientAdresseDev(contenu))
    .map(({ chemin }) => chemin)
}
