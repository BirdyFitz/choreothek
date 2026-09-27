import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortRows, nextSort } from '../src/renderer/lib/sortRows.js'

const rows = [
  { song_name: 'Zebra', rhythm: 'Salsa', edition_label: 'Mega Mix 100', jam_datum: null },
  { song_name: 'äpfel', rhythm: null, jammer_name: 'Erika Beispiel', jam_datum: '2025-03-14' },
  { song_name: 'Banane', rhythm: 'Cumbia', edition_label: 'Mega Mix 99', jam_datum: null },
  { song_name: 'apfel', rhythm: 'Merengue', jammer_name: 'Anna Muster', jam_datum: '2024-11-02' }
]
const names = (r) => r.map((x) => x.song_name)

test('ohne Sortierung bleibt die Server-Reihenfolge', () => {
  assert.equal(sortRows(rows, null), rows)
})

test('aufsteigend deutsch, Umlaute und Groß-/Kleinschreibung gleichwertig', () => {
  assert.deepEqual(names(sortRows(rows, { key: 'song', dir: 'asc' })), ['äpfel', 'apfel', 'Banane', 'Zebra'])
})

test('absteigend', () => {
  assert.deepEqual(names(sortRows(rows, { key: 'song', dir: 'desc' })), ['Zebra', 'Banane', 'äpfel', 'apfel'])
})

test('leere Werte immer am Ende, in beide Richtungen', () => {
  assert.equal(sortRows(rows, { key: 'rhythm', dir: 'asc' }).at(-1).song_name, 'äpfel')
  assert.equal(sortRows(rows, { key: 'rhythm', dir: 'desc' }).at(-1).song_name, 'äpfel')
})

test('Zahlen im Text natürlich sortiert (Mega Mix 99 vor 100)', () => {
  const r = sortRows(rows, { key: 'source', dir: 'asc' }).map((x) => x.jammer_name || x.edition_label)
  assert.deepEqual(r, ['Anna Muster', 'Erika Beispiel', 'Mega Mix 99', 'Mega Mix 100'])
})

test('Datum nach ISO-Datum, ohne Datum am Ende', () => {
  assert.deepEqual(names(sortRows(rows, { key: 'date', dir: 'desc' })), ['äpfel', 'apfel', 'Zebra', 'Banane'])
})

test('Klickfolge ohne → auf → ab → ohne, andere Spalte beginnt aufsteigend', () => {
  let s = nextSort(null, 'song')
  assert.deepEqual(s, { key: 'song', dir: 'asc' })
  s = nextSort(s, 'song')
  assert.deepEqual(s, { key: 'song', dir: 'desc' })
  assert.equal(nextSort(s, 'song'), null)
  assert.deepEqual(nextSort({ key: 'song', dir: 'desc' }, 'rhythm'), { key: 'rhythm', dir: 'asc' })
})
