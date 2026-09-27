// Startet alle *.test.js in diesem Ordner im selben Prozess (Electrons Node, siehe npm test)
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort()) {
  await import(pathToFileURL(path.join(dir, file)).href)
}
