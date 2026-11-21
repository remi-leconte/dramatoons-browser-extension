// web-ext lint ne vérifie que les règles de Firefox : ce script couvre ce qu'il ne voit pas pour Chromium
// (service_worker, fichiers absents) et la syntaxe de tous les fichiers JS
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = 'src'
const erreurs = []

let manifeste
try {
  manifeste = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'))
} catch (erreur) {
  console.error(`manifest.json illisible : ${erreur.message}`)
  process.exit(1)
}

const paquet = JSON.parse(readFileSync('package.json', 'utf8'))
if (manifeste.version !== paquet.version) {
  erreurs.push(`version du manifeste (${manifeste.version}) différente de celle de package.json (${paquet.version})`)
}

const references = [
  ...Object.values(manifeste.icons ?? {}),
  // default_icon est une chaîne ou un objet par taille
  ...(typeof manifeste.action?.default_icon === 'string'
    ? [manifeste.action.default_icon]
    : Object.values(manifeste.action?.default_icon ?? {})),
  manifeste.action?.default_popup,
  manifeste.background?.service_worker,
  ...(manifeste.background?.scripts ?? []),
  ...(manifeste.content_scripts ?? []).flatMap((script) => [...(script.js ?? []), ...(script.css ?? [])]),
].filter(Boolean)

for (const fichier of references) {
  if (!existsSync(join(source, fichier))) erreurs.push(`fichier référencé par le manifeste absent : ${fichier}`)
}

// tests/ n'existe pas tant qu'aucun test n'est écrit
const fichiersJs = (dossier) =>
  !existsSync(dossier) ? [] : readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) return entree.name === 'node_modules' ? [] : fichiersJs(chemin)
    return /\.m?js$/.test(entree.name) ? [chemin] : []
  })

for (const fichier of [...fichiersJs(source), ...fichiersJs('scripts'), ...fichiersJs('tests')]) {
  try {
    execFileSync(process.execPath, ['--check', fichier], { stdio: 'pipe' })
  } catch (erreur) {
    erreurs.push(`syntaxe invalide dans ${fichier} :\n${erreur.stderr}`)
  }
}

if (erreurs.length > 0) {
  for (const erreur of erreurs) console.error(erreur)
  process.exit(1)
}
console.log(`Manifeste et syntaxe vérifiés (${references.length} fichiers référencés)`)
