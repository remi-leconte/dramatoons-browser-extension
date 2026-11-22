// Construit le zip publié sur les stores : une copie de src/ réglée pour la production, dans dist/
import { spawnSync } from 'node:child_process'
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { configProduction, fichiersAvecAdresseDev, manifesteProduction } from './production.mjs'

const destination = 'dist'
const copie = join(destination, 'src')

rmSync(destination, { recursive: true, force: true })
cpSync('src', copie, { recursive: true })

const cheminConfig = join(copie, 'config.mjs')
writeFileSync(cheminConfig, configProduction(readFileSync(cheminConfig, 'utf8')))
const cheminManifeste = join(copie, 'manifest.json')
const manifeste = manifesteProduction(JSON.parse(readFileSync(cheminManifeste, 'utf8')))
writeFileSync(cheminManifeste, `${JSON.stringify(manifeste, null, 2)}\n`)

const fichiers = readdirSync(copie, { recursive: true, withFileTypes: true })
  .filter((entree) => entree.isFile())
  .map((entree) => {
    const chemin = join(entree.parentPath, entree.name)
    return { chemin, contenu: readFileSync(chemin, 'utf8') }
  })
const restes = fichiersAvecAdresseDev(fichiers)
if (restes.length > 0) {
  console.error(`Adresse du dev restée dans : ${restes.join(', ')}`)
  process.exit(1)
}

const zip = `dramatoons-highlighter-${manifeste.version}.zip`
const build = spawnSync(
  'npx',
  ['web-ext', 'build', '--source-dir', copie, '--artifacts-dir', destination, '--filename', zip, '--overwrite-dest'],
  { stdio: 'inherit' },
)
if (build.status !== 0) process.exit(1)
console.log(`Zip de production : ${join(destination, zip)}`)
