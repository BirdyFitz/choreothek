// Player (Paket 6): Zeitangaben und A–B-Schleife
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTime, formatTime, loopJump, SPEEDS } from '../src/renderer/lib/player.js'

test('Zeitangaben lesen', () => {
  assert.equal(parseTime('1:23'), 83)
  assert.equal(parseTime('01:02:03'), 3723)
  assert.equal(parseTime('83'), 83)
  assert.equal(parseTime('83,5'), 83.5)
  assert.equal(parseTime(' 0:05 '), 5)
  for (const bad of ['', 'abc', '1:75', '1::2', '-3', '1:2:3:4']) assert.equal(parseTime(bad), null, bad)
})

test('Zeitangaben anzeigen', () => {
  assert.equal(formatTime(0), '0:00')
  assert.equal(formatTime(83.9), '1:23')
  assert.equal(formatTime(3723), '1:02:03')
  assert.equal(formatTime(NaN), '0:00')
})

test('A–B-Schleife', () => {
  assert.equal(loopJump(50, null, null, 200), null, 'ohne A keine Schleife')
  assert.equal(loopJump(15, 10, 20, 200), null, 'innerhalb bleibt')
  assert.equal(loopJump(20, 10, 20, 200), 10, 'bei B zurück zu A')
  assert.equal(loopJump(5, 10, 20, 200), 10, 'vor A (z. B. zurückgespult) springt nach A')
  assert.equal(loopJump(20, 20, 10, 200), 10, 'vertauschte Punkte')
  assert.equal(loopJump(200, 150, null, 200), 150, 'nur A: bis zum Ende')
  assert.equal(loopJump(10, 10, 10.1, 200), null, 'zu kurzer Abschnitt')
})

test('Tempo von 0,5 bis 1', () => {
  assert.equal(Math.min(...SPEEDS), 0.5)
  assert.equal(Math.max(...SPEEDS), 1)
})
