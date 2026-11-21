// web-ext lint, avertissements compris, sauf celui-ci : le manifeste déclare l'arrière-plan pour les deux
// navigateurs, et Firefox ignore volontairement la clé service_worker (Chrome et Edge, eux, ignorent scripts)
import { spawnSync } from 'node:child_process'

const ATTENDUS = new Set(['BACKGROUND_SERVICE_WORKER_IGNORED'])

const lint = spawnSync('npx', ['web-ext', 'lint', '--source-dir', 'src', '--output', 'json'], {
  encoding: 'utf8',
})
let rapport
try {
  rapport = JSON.parse(lint.stdout)
} catch {
  console.error(lint.stdout, lint.stderr)
  process.exit(1)
}

const problemes = [...rapport.errors, ...rapport.warnings.filter((avertissement) => !ATTENDUS.has(avertissement.code))]
for (const probleme of problemes) console.error(`${probleme.code} : ${probleme.message} (${probleme.file ?? ''})`)
if (problemes.length > 0) process.exit(1)
console.log(`web-ext lint : aucune erreur, aucun avertissement inattendu (${rapport.notices.length} notice(s))`)
