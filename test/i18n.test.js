// Sprachdatei: alle verwendeten Schlüssel vorhanden, keine verwaisten Texte, keine fest
// eingebauten Texte mehr in der Oberfläche.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { t } from '../src/shared/i18n.js'
import de from '../src/shared/locales/de.json' with { type: 'json' }

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(full)
    return /\.(js|jsx)$/.test(e.name) ? [full] : []
  })
}

function leafKeys(node, prefix = '') {
  return Object.entries(node).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !('one' in v && 'other' in v)) return leafKeys(v, key)
    return [key]
  })
}

const files = sourceFiles(root)
const code = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
// t('…') mit festem Schlüssel; Schlüssel mit ${…} (z. B. results.columns.${key}) als Präfix
const literalKeys = [...code.matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)].map((m) => m[1])
const dynamicPrefixes = [...code.matchAll(/\bt\(\s*`([\w.]+)\.\$\{/g)].map((m) => m[1])
const allKeys = leafKeys(de)

test('jeder im Code verwendete Schlüssel steht in de.json', () => {
  const missing = [...new Set(literalKeys)].filter((k) => !allKeys.includes(k))
  assert.deepEqual(missing, [])
})

test('dynamische Schlüssel haben Einträge (Spalten, Quellen)', () => {
  for (const prefix of dynamicPrefixes) {
    assert.ok(allKeys.some((k) => k.startsWith(prefix + '.')), `keine Einträge unter ${prefix}`)
  }
  for (const col of ['song', 'artist', 'rhythm', 'source', 'date', 'location']) assert.ok(allKeys.includes(`results.columns.${col}`))
  for (const q of ['all', 'jam', 'megamix', 'zin']) assert.ok(allKeys.includes(`filter.sources.${q}`))
})

test('keine verwaisten Texte in de.json', () => {
  // auch Schlüssel, die per Bedingung gewählt werden: t(x ? 'a.b' : 'a.c')
  const quoted = [...code.matchAll(/['"]([a-z]\w*(?:\.\w+)+)['"]/g)].map((m) => m[1])
  const used = new Set([...literalKeys, ...quoted])
  const unused = allKeys.filter((k) => !used.has(k) && !dynamicPrefixes.some((p) => k.startsWith(p + '.')) && !k.startsWith('meta.language'))
  assert.deepEqual(unused, [])
})

test('keine fest eingebauten Texte zwischen JSX-Tags', () => {
  const offenders = []
  for (const file of files.filter((f) => f.endsWith('.jsx'))) {
    const src = fs.readFileSync(file, 'utf8')
    for (const m of src.matchAll(/>\s*([^<>{}\n]*[A-Za-zÄÖÜäöüß]{3,}[^<>{}\n]*)\s*</g)) {
      const text = m[1].trim()
      // Code-Schnipsel (z. B. Pfeilfunktionen) sind kein Anzeigetext
      if (!text || /=>|&&|\|\||[()?;=]|^:|^(return|const|let|if|else)\b/.test(text)) continue
      offenders.push(`${path.basename(file)}: „${text}“`)
    }
  }
  assert.deepEqual(offenders, [])
})

test('Platzhalter und Mehrzahl', () => {
  assert.equal(t('errors.folderNotFound', { path: 'D:/Musik' }), 'Ordner nicht gefunden: D:/Musik')
  assert.equal(t('results.songs', { count: 1 }), '1 Song')
  assert.equal(t('results.songs', { count: 12 }), '12 Songs')
  assert.equal(t('results.unassigned', { count: 1 }), '· 1 nicht zugeordnetes Video')
})

test('unbekannter Schlüssel liefert den Schlüssel selbst (fällt auf, statt leer zu bleiben)', () => {
  assert.equal(t('gibt.es.nicht'), 'gibt.es.nicht')
})
