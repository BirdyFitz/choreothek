import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMegaMixFilename } from '../src/server/utils/musicFilenameParser.js'

test('MegaMix-Dateiname: Edition, Position, Titel und Rhythmus', () => {
  assert.deepEqual(parseMegaMixFilename('934-Mega Mix 114 - 02 Sonnenschein - Merengue.mp3'), {
    editionNumber: 114, editionLabel: 'Mega Mix 114', position: 2, songName: 'Sonnenschein', rhythm: 'Merengue'
  })
})

test('Rhythmus ohne Dateiendung – auch bei anderen Audioformaten als MP3', () => {
  for (const ext of ['mp3', 'MP3', 'm4a', 'wav', 'flac', 'ogg']) {
    assert.equal(parseMegaMixFilename(`Mega Mix 115 - 01 Sonnenstrahl - Salsa.${ext}`).rhythm, 'Salsa', ext)
  }
})

test('Titel mit Bindestrich bleibt ganz', () => {
  const p = parseMegaMixFilename('Mega Mix 60 - 03 Hin - und - Her - Reggaeton.m4a')
  assert.equal(p.songName, 'Hin - und - Her')
  assert.equal(p.rhythm, 'Reggaeton')
})
