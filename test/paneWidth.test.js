import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampPaneWidth, LIST_MIN_WIDTH } from '../src/renderer/lib/paneWidth.js'

const FILTER = { min: 200, max: 480 }

test('Breite innerhalb der Grenzen bleibt, wie sie ist', () => {
  assert.equal(clampPaneWidth(300, { ...FILTER, windowWidth: 1600, otherPaneWidth: 400 }), 300)
})

test('zu schmal/zu breit wird auf min/max begrenzt', () => {
  assert.equal(clampPaneWidth(50, { ...FILTER, windowWidth: 1600, otherPaneWidth: 400 }), 200)
  assert.equal(clampPaneWidth(900, { ...FILTER, windowWidth: 1600, otherPaneWidth: 400 }), 480)
})

test('Ergebnisliste behält ihre Mindestbreite', () => {
  // 1200 Fenster - 500 Details - 360 Liste = 340 Platz für den Filter
  assert.equal(clampPaneWidth(480, { ...FILTER, windowWidth: 1200, otherPaneWidth: 500 }), 1200 - 500 - LIST_MIN_WIDTH)
})

test('sehr kleines Fenster: nie unter die eigene Mindestbreite', () => {
  assert.equal(clampPaneWidth(300, { ...FILTER, windowWidth: 700, otherPaneWidth: 400 }), 200)
})
