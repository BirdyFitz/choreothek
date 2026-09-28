// Datenbank: Schema-Migration, erneutes Öffnen, Löschweitergabe, Suche. Erfundene Daten.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { setDataDir } from '../src/server/paths.js'
import * as db from '../src/server/db.js'

let dir
let file

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'choreothek-db-'))
  setDataDir(dir)
  file = path.join(dir, 'choreothek.sqlite')
})

after(() => {
  db.closeDB()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('neue Datenbank: alle Migrationen laufen, Schema-Stand wird vermerkt', async () => {
  await db.initDB(file)
  db.closeDB()
  const raw = new Database(file, { readonly: true })
  const version = raw.pragma('user_version', { simple: true })
  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name)
  raw.close()
  assert.ok(version >= 1)
  assert.deepEqual(tables, ['ai_calls', 'jams', 'megamix_songs', 'megamixes', 'settings', 'songs', 'video_runs', 'zin_volume_songs', 'zin_volumes'])
})

test('erneutes Öffnen: Daten bleiben, Migrationen laufen nicht doppelt', async () => {
  await db.initDB(file)
  const jamId = await db.insertJam('Anna Muster', '2. Mai 2024', '1-a.pdf', 'Musterhalle', null)
  await db.insertSongs(jamId, [{ name: 'Probelied', rhythm: 'Cumbia', position: 1, page: 2 }])
  await db.setSetting('media_roots', '["D:/Tanz"]')
  db.closeDB()

  await db.initDB(file) // würde bei doppelter Migration mit "table already exists" scheitern
  assert.equal((await db.getAllJams()).length, 1)
  assert.equal(await db.getSetting('media_roots'), '["D:/Tanz"]')
  const [jam] = await db.getJamList()
  assert.equal(jam.jam_datum, '2024-05-02')
  assert.equal(jam.song_count, 1)
})

test('Einstellung überschreiben statt doppelt anlegen', async () => {
  await db.setSetting('megamix_root', 'D:/A')
  await db.setSetting('megamix_root', 'D:/B')
  assert.equal(await db.getSetting('megamix_root'), 'D:/B')
})

test('Jam löschen entfernt ihre Songs mit (Fremdschlüssel)', async () => {
  const jamId = await db.insertJam('Erika Beispiel', null, '2-b.pdf', null, null)
  await db.insertSongs(jamId, [{ name: 'Weg damit', rhythm: 'Salsa' }])
  const conn = await db.initDB(file)
  conn.prepare('DELETE FROM jams WHERE id = ?').run(jamId)
  const left = conn.prepare('SELECT COUNT(*) AS n FROM songs WHERE jam_id = ?').get(jamId).n
  assert.equal(left, 0)
})

test('Suche: Umlaute ohne Groß-/Kleinschreibung, Quelle, Zeitraum', async () => {
  const mm = await db.insertMegaMix(7, 'Mega Mix 7', null)
  await db.insertMegaMixSongs(mm, [{ name: 'ÜBERALL', rhythm: 'Merengue', position: 1 }])
  assert.deepEqual((await db.searchSongs(undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'überall')).map((r) => r.song_name), ['ÜBERALL'])
  assert.equal((await db.searchSongs('cumbia', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'megamix')).length, 0)
  const imZeitraum = await db.searchSongs(undefined, undefined, undefined, undefined, '2024-05-01', '2024-05-31')
  assert.deepEqual(imZeitraum.map((r) => r.song_name), ['Probelied'])
})

test('Migration 5: Bezeichnungen der Volumes ohne Kürzel', async () => {
  const conn = await db.initDB(file)
  conn.prepare("INSERT INTO zin_volumes (edition_number, edition_label) VALUES (42, 'XYZ Volume 42')").run()
  conn.pragma('user_version = 4')
  db.closeDB()
  await db.initDB(file)
  assert.deepEqual(await db.getAllZinVolumeEditionLabels(), ['Volume 42'])
})
