// Startet jede *.test.js in einem eigenen Prozess (Electrons Node, siehe npm test).
// Getrennte Prozesse, damit Vorbereitung/Aufräumen (before/after) einer Datei nicht mit
// anderen Dateien vermischt wird -- in einem gemeinsamen Prozess blieb der Lauf sonst hängen.
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))
let failed = 0
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort()) {
  console.log(`\n# ${file}`)
  const result = spawnSync(process.execPath, ['--test-reporter=spec', path.join(dir, file)], {
    stdio: 'inherit',
    env: process.env,
    timeout: 120000
  })
  if (result.status !== 0) {
    failed++
    console.log(`# ${file}: fehlgeschlagen (Exit-Code ${result.status ?? result.signal})`)
  }
}
console.log(failed ? `\nℹ fail ${failed} Testdatei(en)` : '\nℹ fail 0 – alle Testdateien bestanden')
process.exit(failed ? 1 : 0)
