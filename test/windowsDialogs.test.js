import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROPERTIES_HELPER_SCRIPT as script } from '../src/main/windowsDialogs.js'

test('Eigenschaften-Helfer: Pfad kommt über stdin, nicht im Skripttext (keine Anführungszeichen-Probleme)', () => {
  assert.match(script, /\[Console\]::In\.ReadLine\(\)/)
  assert.doesNotMatch(script, /\$path = '/)
})

test('Eigenschaften-Helfer: kein "Split-Path -LiteralPath -Leaf" (gibt es in PowerShell 5.1 nicht)', () => {
  assert.doesNotMatch(script, /Split-Path[^\n]*-LiteralPath[^\n]*-Leaf/)
  assert.match(script, /\[IO\.Path\]::GetFileName\(\$path\)/)
})

test('Eigenschaften-Helfer: vorgewärmt, Dialog nach vorn, Fehler werden gemeldet', () => {
  assert.match(script, /Vorwärmen/)
  assert.match(script, /BringToFront/)
  assert.match(script, /'fehler ' \+ \$_\.Exception\.Message/)
})
