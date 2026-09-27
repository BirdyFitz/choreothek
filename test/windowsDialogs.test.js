import { test } from 'node:test'
import assert from 'node:assert/strict'
import { propertiesScript } from '../src/main/windowsDialogs.js'

test('Eigenschaften-Skript: Apostroph im Pfad wird für PowerShell verdoppelt', () => {
  const script = propertiesScript("D:/Musik/Rock'n'Roll - Probe.mp3")
  assert.ok(script.includes("$path = 'D:/Musik/Rock''n''Roll - Probe.mp3'"))
})

test('Eigenschaften-Skript: Dialog wird nach vorn geholt und bleibt offen, solange er sichtbar ist', () => {
  const script = propertiesScript('D:/Musik/Probe.mp3')
  assert.match(script, /InvokeVerb\('properties'\)/)
  assert.match(script, /BringToFront/)
  assert.match(script, /while \(\[Win\]::VisibleWindowOf\(\$PID\) -ne \[IntPtr\]::Zero\)/)
})
