// web-ext lint, avertissements compris, sauf celui-ci : le manifeste déclare l'arrière-plan pour les deux
// navigateurs, et Firefox ignore volontairement la clé service_worker (les navigateurs Chromium, eux, ignorent scripts)
import { spawnSync } from 'node:child_process'

const ATTENDUS = new Set(['BACKGROUND_SERVICE_WORKER_IGNORED'])

// Dossier vérifié : src/ par défaut, ou la copie de production (dist/src) passée en argument
const dossier = process.argv[2] ?? 'src'
const lint = spawnSync('npx', ['web-ext', 'lint', '--source-dir', dossier, '--output', 'json'], {
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
console.log(`web-ext lint ${dossier} : aucune erreur, aucun avertissement inattendu (${rapport.notices.length} notice(s))`)
