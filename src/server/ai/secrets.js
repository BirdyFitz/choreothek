// Ablage der API-Schlüssel. Der Electron-Hauptprozess setzt einen Speicher, der mit der
// Windows-Verschlüsselung (safeStorage, an das Benutzerkonto gebunden) arbeitet; ohne ihn
// (Tests) nur im Arbeitsspeicher. Schlüssel verlassen den Server nie Richtung Oberfläche.
let store = createMemoryStore();

export function createMemoryStore() {
  const keys = new Map();
  return {
    get: (provider) => keys.get(provider) || null,
    set: (provider, key) => keys.set(provider, key),
    delete: (provider) => keys.delete(provider),
    has: (provider) => keys.has(provider)
  };
}

export function setSecretStore(s) {
  store = s;
}

export function getApiKey(provider) {
  return store.get(provider);
}

export function setApiKey(provider, key) {
  store.set(provider, key);
}

export function deleteApiKey(provider) {
  store.delete(provider);
}

export function hasApiKey(provider) {
  return store.has(provider);
}
