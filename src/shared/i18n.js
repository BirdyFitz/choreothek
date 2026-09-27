// Übersetzungen für Oberfläche, Electron-Hauptprozess und Server (gemeinsame Sprachdateien).
// Neue Sprache: locales/<code>.json anlegen (gleiche Schlüssel) und unten in LOCALES eintragen.
//
//   t('filter.song')                        -> "Song"
//   t('errors.folderNotFound', { path })    -> "Ordner nicht gefunden: D:\…"
//   t('results.songs', { count: 3 })        -> Mehrzahlform über { one, other }
import de from './locales/de.json' with { type: 'json' };

export const LOCALES = { de };
export const FALLBACK_LANGUAGE = 'de';

let language = FALLBACK_LANGUAGE;

export function setLanguage(code) {
  if (LOCALES[code]) language = code;
}

export function getLanguage() {
  return language;
}

function lookup(messages, key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), messages);
}

export function t(key, params = {}) {
  let message = lookup(LOCALES[language], key) ?? lookup(LOCALES[FALLBACK_LANGUAGE], key);
  if (message && typeof message === 'object' && 'count' in params) {
    message = params.count === 1 ? message.one : message.other;
  }
  if (typeof message !== 'string') return key;
  return message.replace(/\{(\w+)\}/g, (match, name) => (params[name] !== undefined ? String(params[name]) : match));
}
