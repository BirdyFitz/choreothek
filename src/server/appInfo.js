// Angaben für „Über Choreothek“ und „Problem melden“: Versionen, Drittlizenzen und die letzten
// Fehlermeldungen (aus Server und Oberfläche). Berichte enthalten keine Schlüssel und nur gekürzte Pfade.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAX_ERRORS = 40;
const errors = [];
let info = { version: null };

export function setAppInfo(values) {
  info = { ...info, ...values };
}

// Pfad (bis Zeilenende/Anführungszeichen, Ordnernamen dürfen Leerzeichen enthalten) -> nur der
// Dateiname mit Endung bleibt; Ordnernamen fallen ganz weg (sie enthalten oft Namen von Personen)
function shortenPath(match, sep) {
  const segments = match.split(sep);
  const last = segments[segments.length - 1];
  const file = last.match(/^(.*?\.[A-Za-z0-9]{2,4})(?=$|[\s,;:)])(.*)$/);
  return file ? `…${sep}${file[1]}${file[2]}` : `…${sep}`;
}

// Pfade kürzen, Schlüssel und E-Mail-Adressen entfernen
export function sanitize(text) {
  return String(text)
    .replace(/sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}/g, '[Schlüssel entfernt]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[E-Mail entfernt]')
    .replace(/(?:[A-Za-z]:|\\\\[^\\\s'"]+)\\[^\n'"<>|]*/g, (m) => shortenPath(m, '\\'))
    .replace(/\/(?:Users|home|data|volume\d)\/[^\n'"<>|]*/g, (m) => shortenPath(m, '/'));
}

export function recordError(source, message) {
  errors.push({ time: new Date().toISOString(), source, message: sanitize(message).slice(0, 600) });
  if (errors.length > MAX_ERRORS) errors.shift();
}

// Fehlerausgaben des Servers mitschreiben (zusätzlich zur normalen Ausgabe)
let capturing = false;

export function captureConsoleErrors() {
  if (capturing) return;
  capturing = true;
  const original = console.error;
  console.error = (...args) => {
    recordError('server', args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    original(...args);
  };
}

export function recentErrors() {
  return [...errors];
}

export function about() {
  return {
    version: info.version || JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version,
    electron: process.versions.electron || null,
    chrome: process.versions.chrome || null,
    node: process.versions.node,
    os: `${os.version ? os.version() : os.type()} (${os.release()}, ${os.arch()})`
  };
}

// Direkte Abhängigkeiten mit Lizenz, aus den mitgelieferten Paketen gelesen
export function thirdPartyLicenses() {
  const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  return Object.keys(pkg.dependencies || {})
    .map((name) => {
      try {
        const dep = JSON.parse(fs.readFileSync(path.join(appRoot, 'node_modules', name, 'package.json'), 'utf8'));
        return { name, version: dep.version, license: typeof dep.license === 'string' ? dep.license : dep.license?.type || '?' };
      } catch {
        return { name, version: null, license: '?' };
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function problemReport(userText = '') {
  const a = about();
  const lines = [
    userText ? `Beschreibung:\n${sanitize(userText).slice(0, 2000)}\n` : '',
    `Choreothek ${a.version}`,
    `Windows: ${a.os}`,
    `Electron ${a.electron || '–'}, Chrome ${a.chrome || '–'}, Node ${a.node}`,
    '',
    errors.length ? `Letzte Fehler (${errors.length}):` : 'Keine Fehler protokolliert.',
    ...errors.slice(-15).map((e) => `[${e.time.slice(0, 19).replace('T', ' ')}] ${e.source}: ${e.message}`)
  ];
  return lines.filter((l, i) => l || i > 0).join('\n');
}
