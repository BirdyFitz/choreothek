// API-Schlüssel dauerhaft ablegen: verschlüsselt mit Electron safeStorage (unter Windows
// DPAPI, an das Windows-Benutzerkonto gebunden). In der Datei steht nie Klartext; ohne
// verfügbare Verschlüsselung bleiben Schlüssel nur bis zum Beenden im Arbeitsspeicher.
import fs from 'fs';
import path from 'path';
import { safeStorage } from 'electron';
import { createMemoryStore } from '../server/ai/secrets.js';

export function createSafeStorageStore(dataDir) {
  if (!safeStorage.isEncryptionAvailable()) {
    console.error('safeStorage nicht verfügbar – API-Schlüssel werden nicht gespeichert.');
    return createMemoryStore();
  }
  const file = path.join(dataDir, 'api-keys.json');

  const readAll = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  };
  const writeAll = (entries) => {
    fs.writeFileSync(file, JSON.stringify(entries, null, 2));
  };

  return {
    get(provider) {
      const encrypted = readAll()[provider];
      if (!encrypted) return null;
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch {
        return null; // z. B. Datei von einem anderen Windows-Konto
      }
    },
    set(provider, key) {
      writeAll({ ...readAll(), [provider]: safeStorage.encryptString(key).toString('base64') });
    },
    delete(provider) {
      const entries = readAll();
      delete entries[provider];
      writeAll(entries);
    },
    has(provider) {
      return this.get(provider) !== null;
    }
  };
}
